"""WhatsApp personalized dispatch & provider integration for Pastors and Sector Leaders."""
import os
import re
import secrets
import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from . import store as s
from .app import session, fail
from .platform_access import MODULES, platform_admin, is_pastor
from .modules.common import encrypt_text, decrypt_text
from .modules.ministries.router import CATALOG as MINISTRY_CATALOG

router = APIRouter(prefix='/api/platform/whatsapp', tags=['WhatsApp'])

PROVIDERS = ('evolution', 'zapi', 'meta', 'webhook')
SECTOR_LABELS = {
    'all': 'Igreja Lagoinha',
    'members': 'Membros & GCs',
    'ministries': 'Ministérios & Voluntariado',
    'kids': 'Lagoinha Kids',
    'finance': 'Lagoinha Finance',
}


def normalize_br_phone(raw: str | None) -> str:
    """Normalize a Brazilian or international phone number to E.164 digits (e.g. 5533999112233)."""
    if not raw:
        return ''
    digits = re.sub(r'\D', '', str(raw))
    digits = digits.lstrip('0')
    if not digits:
        return ''
    if len(digits) in (10, 11):
        return '55' + digits
    if len(digits) in (12, 13) and digits.startswith('55'):
        return digits
    if len(digits) >= 11:
        return digits
    return ''


def first_name_of(full_name: str) -> str:
    parts = (full_name or '').strip().split()
    return parts[0].capitalize() if parts else 'Irmão(ã)'


def authorized_sectors_for(c, user: dict) -> tuple[bool, list[str], str]:
    """Return (is_global_leader, allowed_sectors, ministry_scope)."""
    is_root = platform_admin(c, user['id']) or is_pastor(c, user['id'])
    if is_root:
        return True, ['all', 'members', 'ministries', 'kids', 'finance'], ''

    leader_rows = c.execute(
        "SELECT module, role FROM module_access WHERE user_id=? AND enabled=1 AND role IN ('admin','pastor','editor')",
        (user['id'],)
    ).fetchall()
    sectors = [r['module'] for r in leader_rows if r['module'] in MODULES]
    if user.get('role') in ('admin', 'teacher') and 'kids' not in sectors:
        sectors.append('kids')

    scope_row = c.execute(
        "SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",
        (user['id'],)
    ).fetchone()
    ministry_scope = (scope_row['scope'] or '').strip() if scope_row else ''
    return False, sectors, ministry_scope


def require_leader(c, user: dict, target_sector: str | None = None) -> tuple[bool, list[str], str]:
    is_root, sectors, ministry_scope = authorized_sectors_for(c, user)
    if not is_root and not sectors:
        fail('forbidden', 'Apenas Pastores, Admin TI e responsáveis de setor podem enviar mensagens personalizadas no WhatsApp.', 403)
    if target_sector:
        if target_sector not in SECTOR_LABELS:
            fail('target_sector', 'Setor inválido.')
        if not is_root and (target_sector == 'all' or target_sector not in sectors):
            fail('forbidden', f'Você não possui permissão de liderança para disparar avisos pelo setor {SECTOR_LABELS.get(target_sector, target_sector)}.', 403)
    return is_root, sectors, ministry_scope


def load_whatsapp_config(c) -> dict:
    row = c.execute("SELECT * FROM whatsapp_settings WHERE id='default'").fetchone()
    if row:
        d = dict(row)
        d['api_token'] = decrypt_text(d.get('api_token') or '')
        d['client_token'] = decrypt_text(d.get('client_token') or '')
        d['enabled'] = bool(d.get('enabled', 1))
        return d
    return {
        'id': 'default',
        'provider': os.getenv('WHATSAPP_PROVIDER', 'evolution').strip().lower(),
        'api_url': os.getenv('WHATSAPP_API_URL', '').strip(),
        'instance_id': os.getenv('WHATSAPP_INSTANCE_ID', '').strip(),
        'api_token': os.getenv('WHATSAPP_API_TOKEN', '').strip(),
        'client_token': os.getenv('WHATSAPP_CLIENT_TOKEN', '').strip(),
        'sender_name': os.getenv('WHATSAPP_SENDER_NAME', 'Igreja Batista da Lagoinha').strip(),
        'enabled': True,
    }


def is_provider_configured(cfg: dict) -> bool:
    if not cfg.get('enabled', True):
        return False
    provider = cfg.get('provider', 'evolution')
    if provider == 'meta':
        return bool(cfg.get('instance_id') and cfg.get('api_token'))
    if provider == 'webhook':
        return bool(cfg.get('api_url'))
    return bool(cfg.get('api_url') and cfg.get('api_token'))


def collect_recipients(c, sector: str, group: str = '', q: str = '', ministry_scope: str = '') -> list[dict]:
    """Gather deduplicated contacts with phone numbers for the requested sector and group filter."""
    users_by_email = {}
    users_by_id = {}
    for u in c.execute('SELECT id, name, email, phone, role, staff_role FROM users WHERE active=1').fetchall():
        ud = dict(u)
        users_by_id[ud['id']] = ud
        if ud.get('email'):
            users_by_email[ud['email'].strip().lower()] = ud

    cells_by_id = {
        r['id']: r['name']
        for r in c.execute('SELECT id, name FROM members_cells WHERE active=1').fetchall()
    }

    ministry_map: dict[str, list[dict]] = {}
    for a in c.execute('SELECT person_id, ministry, position, is_leader FROM ministries_assignments WHERE active=1').fetchall():
        ministry_map.setdefault(a['person_id'], []).append(dict(a))

    contacts_by_phone: dict[str, dict] = {}

    def register_contact(name: str, phone: str, sector_label: str, user_id: int | None = None,
                         person_id: str | None = None, cell_id: str | None = None,
                         ministries: list[str] | None = None, extra_tags: list[str] | None = None):
        norm = normalize_br_phone(phone)
        if not norm:
            return
        existing = contacts_by_phone.get(norm)
        if existing:
            if not existing.get('user_id') and user_id:
                existing['user_id'] = user_id
            if cell_id and not existing.get('cell_id'):
                existing['cell_id'] = cell_id
                existing['cell_name'] = cells_by_id.get(cell_id, '')
            for m in (ministries or []):
                if m not in existing['ministries']:
                    existing['ministries'].append(m)
            for t in (extra_tags or []):
                if t not in existing['tags']:
                    existing['tags'].append(t)
            return

        clean_name = (name or '').strip()
        if not clean_name:
            return
        contacts_by_phone[norm] = {
            'key': norm,
            'name': clean_name,
            'first_name': first_name_of(clean_name),
            'phone': phone.strip(),
            'normalized_phone': norm,
            'user_id': user_id,
            'person_id': person_id,
            'sector_label': sector_label,
            'cell_id': cell_id or '',
            'cell_name': cells_by_id.get(cell_id or '', ''),
            'ministries': list(ministries or []),
            'tags': list(extra_tags or []),
        }

    # 1. Members & Ministries from members_people
    if sector in ('all', 'members', 'ministries'):
        for p in c.execute('SELECT * FROM members_people WHERE active=1 ORDER BY name').fetchall():
            pd = dict(p)
            linked_user = users_by_email.get((pd.get('email') or '').strip().lower())
            raw_phone = (pd.get('phone') or '').strip() or (linked_user.get('phone', '').strip() if linked_user else '')
            if not raw_phone:
                continue

            p_assigns = ministry_map.get(pd['id'], [])
            p_ministries = [a['ministry'] for a in p_assigns]
            is_min_leader = any(a.get('is_leader') for a in p_assigns)

            if sector == 'ministries':
                if not p_ministries:
                    continue
                if ministry_scope and ministry_scope not in p_ministries:
                    continue

            if group.startswith('gc:'):
                target_gc = group.split(':', 1)[1]
                if (pd.get('cell_id') or '') != target_gc:
                    continue
            elif group.startswith('stage:'):
                target_stage = group.split(':', 1)[1]
                if (pd.get('integration_stage') or 'active_member') != target_stage:
                    continue
            elif group == 'birthdays':
                bday = pd.get('birthday') or ''
                cur_month = s.today()[5:7]
                if len(bday) < 7 or bday[5:7] != cur_month:
                    continue
            elif group.startswith('ministry:'):
                target_min = group.split(':', 1)[1]
                if ministry_scope and target_min != ministry_scope:
                    continue
                if target_min not in p_ministries:
                    continue
            elif group == 'leaders':
                if not is_min_leader:
                    continue

            cell_name = cells_by_id.get(pd.get('cell_id') or '', '')
            if sector == 'ministries' or (group.startswith('ministry:') and p_ministries):
                chosen_min = group.split(':', 1)[1] if group.startswith('ministry:') else (ministry_scope or p_ministries[0])
                label = f'Ministério {chosen_min}'
            elif cell_name:
                label = cell_name
            else:
                label = 'Membros Lagoinha'

            tags = []
            if cell_name:
                tags.append(cell_name)
            tags.extend(p_ministries)
            if is_min_leader:
                tags.append('Líder')

            register_contact(
                name=pd['name'],
                phone=raw_phone,
                sector_label=label,
                user_id=linked_user['id'] if linked_user else pd.get('created_by'),
                person_id=pd['id'],
                cell_id=pd.get('cell_id'),
                ministries=p_ministries,
                extra_tags=tags,
            )

    # 2. Kids parents & teachers
    if sector in ('all', 'kids') and not group.startswith('gc:') and not group.startswith('ministry:'):
        rooms_by_id = {
            r['id']: r['name']
            for r in c.execute('SELECT id, name FROM rooms WHERE active=1').fetchall()
        }
        present_children = {
            r['child_id']
            for r in c.execute("SELECT child_id FROM attendance WHERE day=? AND status='present'", (s.today(),)).fetchall()
        }
        for ch in c.execute('SELECT id, name, room_id, parent_id FROM children WHERE archived=0 ORDER BY name').fetchall():
            if group.startswith('room:'):
                if str(ch['room_id'] or '') != group.split(':', 1)[1]:
                    continue
            elif group == 'present':
                if ch['id'] not in present_children:
                    continue
            parent = users_by_id.get(ch['parent_id'])
            if parent and parent.get('phone'):
                rname = rooms_by_id.get(ch['room_id'], 'Lagoinha Kids')
                register_contact(
                    name=parent['name'],
                    phone=parent['phone'],
                    sector_label=f"Kids · {rname}",
                    user_id=parent['id'],
                    extra_tags=[f"Resp. de {ch['name']}", rname],
                )
        # Also include Kids teachers/admins if not filtering by present children
        if group != 'present':
            for u in users_by_id.values():
                if u.get('phone') and u.get('role') in ('admin', 'teacher'):
                    register_contact(
                        name=u['name'],
                        phone=u['phone'],
                        sector_label='Equipe Lagoinha Kids',
                        user_id=u['id'],
                        extra_tags=['Equipe Kids'],
                    )

    # 3. Connected users with module_access or general accounts
    if sector in ('all', 'finance', 'members', 'ministries') and not group:
        for u in users_by_id.values():
            if not u.get('phone'):
                continue
            if sector == 'finance':
                has_fin = c.execute(
                    "SELECT 1 FROM module_access WHERE user_id=? AND module='finance' AND enabled=1",
                    (u['id'],)
                ).fetchone()
                if not has_fin and not platform_admin(c, u['id']) and not is_pastor(c, u['id']):
                    continue
                register_contact(
                    name=u['name'],
                    phone=u['phone'],
                    sector_label='Lagoinha Finance',
                    user_id=u['id'],
                    extra_tags=['Financeiro'],
                )
            elif sector in ('all', 'members'):
                register_contact(
                    name=u['name'],
                    phone=u['phone'],
                    sector_label='App Lagoinha',
                    user_id=u['id'],
                    extra_tags=['Conta Conectada'],
                )

    results = sorted(contacts_by_phone.values(), key=lambda x: x['name'].lower())
    if q.strip():
        needle = q.strip().lower()
        results = [
            r for r in results
            if needle in r['name'].lower()
            or needle in r['phone'].lower()
            or needle in r['normalized_phone']
            or any(needle in t.lower() for t in r['tags'])
        ]
    return results


def render_personalized_message(template: str, recipient: dict, auto_greet: bool = True) -> str:
    text = template.strip()
    has_name_var = bool(re.search(r'\{(nome|primeiro_nome)\}', text, flags=re.IGNORECASE))
    replacements = {
        '{nome}': recipient['name'],
        '{NOME}': recipient['name'],
        '{primeiro_nome}': recipient['first_name'],
        '{PRIMEIRO_NOME}': recipient['first_name'],
        '{setor}': recipient.get('sector_label') or 'Lagoinha',
        '{SETOR}': recipient.get('sector_label') or 'Lagoinha',
        '{grupo}': recipient.get('sector_label') or 'Lagoinha',
        '{gc}': recipient.get('cell_name') or recipient.get('sector_label') or 'Lagoinha',
        '{igreja}': 'Lagoinha',
    }
    for token, val in replacements.items():
        text = text.replace(token, val)
    if auto_greet and not has_name_var:
        text = f"Olá, {recipient['first_name']}! Paz!\n\n{text}"
    return text


def http_post(http: httpx.Client, url: str, headers: dict, payload: dict):
    return http.post(url, headers=headers, json=payload)


def send_via_provider(cfg: dict, recipient: dict, message_text: str, client: httpx.Client | None = None) -> tuple[bool, str]:
    """Send a single WhatsApp message via the configured provider API."""
    if not is_provider_configured(cfg):
        return False, 'API de WhatsApp ainda não configurada pelo Admin/Pastor.'

    provider = (cfg.get('provider') or 'evolution').lower()
    api_url = (cfg.get('api_url') or '').rstrip('/')
    instance_id = (cfg.get('instance_id') or '').strip()
    api_token = (cfg.get('api_token') or '').strip()
    client_token = (cfg.get('client_token') or '').strip()
    phone = recipient['normalized_phone']

    own_client = client is None
    http = client or httpx.Client(timeout=12.0)
    try:
        if provider == 'evolution':
            url = f"{api_url}/message/sendText/{instance_id}" if instance_id else f"{api_url}/message/sendText"
            headers = {'apikey': api_token, 'Content-Type': 'application/json'}
            payload = {'number': phone, 'text': message_text}
            resp = http_post(http, url, headers, payload)
        elif provider == 'zapi':
            if '/send-text' in api_url:
                url = api_url
            else:
                base = api_url or 'https://api.z-api.io'
                url = f"{base}/instances/{instance_id}/token/{api_token}/send-text"
            headers = {'Content-Type': 'application/json'}
            if client_token:
                headers['Client-Token'] = client_token
            payload = {'phone': phone, 'message': message_text}
            resp = http_post(http, url, headers, payload)
        elif provider == 'meta':
            url = f"https://graph.facebook.com/v21.0/{instance_id}/messages"
            headers = {'Authorization': f'Bearer {api_token}', 'Content-Type': 'application/json'}
            payload = {
                'messaging_product': 'whatsapp',
                'recipient_type': 'individual',
                'to': phone,
                'type': 'text',
                'text': {'preview_url': False, 'body': message_text},
            }
            resp = http_post(http, url, headers, payload)
        elif provider == 'webhook':
            headers = {'Content-Type': 'application/json'}
            if api_token:
                headers['Authorization'] = f'Bearer {api_token}'
            payload = {
                'phone': phone,
                'name': recipient['name'],
                'first_name': recipient['first_name'],
                'sector': recipient.get('sector_label', ''),
                'message': message_text,
            }
            resp = http_post(http, api_url, headers, payload)
        else:
            return False, f'Provedor desconhecido: {provider}'

        if 200 <= resp.status_code < 300:
            return True, 'Enviado via API'
        return False, f'HTTP {resp.status_code}: {resp.text[:160]}'
    except Exception as exc:
        return False, str(exc)[:160]
    finally:
        if own_client:
            http.close()


class WhatsAppConfigInput(BaseModel):
    provider: str = Field(default='evolution', max_length=30)
    api_url: str = Field(default='', max_length=300)
    instance_id: str = Field(default='', max_length=160)
    api_token: str = Field(default='', max_length=500)
    client_token: str = Field(default='', max_length=300)
    sender_name: str = Field(default='Igreja Batista da Lagoinha', max_length=120)
    enabled: bool = True


class WhatsAppDispatchInput(BaseModel):
    target_sector: str = Field(default='all', max_length=40)
    target_group: str = Field(default='', max_length=80)
    recipient_keys: list[str] = Field(default_factory=list, max_length=1000)
    message: str = Field(min_length=2, max_length=2000)
    auto_greet: bool = True
    also_notify_app: bool = True


class WhatsAppTestInput(BaseModel):
    phone: str = Field(min_length=8, max_length=30)
    name: str = Field(default='Líder Lagoinha', max_length=120)
    message: str = Field(default='Olá, {primeiro_nome}! Teste de conexão oficial do WhatsApp Lagoinha Systems.', max_length=500)


@router.get('/recipients')
def list_whatsapp_recipients(
    sector: str = Query(default='', max_length=40),
    group: str = Query(default='', max_length=80),
    q: str = Query(default='', max_length=100),
    user=Depends(session),
):
    with s.db() as c:
        is_root, allowed_sectors, ministry_scope = require_leader(c, user)
        chosen_sector = sector.strip() if sector.strip() else allowed_sectors[0]
        if not is_root and chosen_sector not in allowed_sectors:
            chosen_sector = allowed_sectors[0]

        recipients = collect_recipients(c, chosen_sector, group.strip(), q.strip(), ministry_scope)
        cfg = load_whatsapp_config(c)

        cells = [
            dict(r) for r in c.execute('SELECT id, name, neighborhood FROM members_cells WHERE active=1 ORDER BY name').fetchall()
        ] if (is_root or 'members' in allowed_sectors) else []

        ministries = (
            [ministry_scope] if (ministry_scope and not is_root) else list(MINISTRY_CATALOG)
        ) if (is_root or 'ministries' in allowed_sectors) else []

        rooms = [
            dict(r) for r in c.execute('SELECT id, name FROM rooms WHERE active=1 ORDER BY min_age, name').fetchall()
        ] if (is_root or 'kids' in allowed_sectors) else []

        recent_dispatches = [
            dict(r) for r in c.execute(
                'SELECT id, sender_name, target_sector, target_group, total_recipients, sent_count, failed_count, provider, created_at '
                'FROM whatsapp_dispatches ORDER BY created_at DESC LIMIT 10'
            ).fetchall()
        ]

        return {
            'sector': chosen_sector,
            'allowed_sectors': [{'id': k, 'label': SECTOR_LABELS[k]} for k in allowed_sectors],
            'ministry_scope': ministry_scope,
            'cells': cells,
            'ministries': ministries,
            'rooms': rooms,
            'recipients': recipients,
            'provider_status': {
                'configured': is_provider_configured(cfg),
                'provider': cfg.get('provider', 'evolution'),
                'instance_id': cfg.get('instance_id', ''),
                'sender_name': cfg.get('sender_name', 'Igreja Batista da Lagoinha'),
                'can_configure': is_root,
            },
            'recent_dispatches': recent_dispatches,
        }


@router.get('/config')
def get_whatsapp_config(user=Depends(session)):
    with s.db() as c:
        if not (platform_admin(c, user['id']) or is_pastor(c, user['id'])):
            fail('forbidden', 'Apenas Pastores e Admin TI podem configurar o provedor de WhatsApp.', 403)
        cfg = load_whatsapp_config(c)
        return {
            'provider': cfg.get('provider', 'evolution'),
            'api_url': cfg.get('api_url', ''),
            'instance_id': cfg.get('instance_id', ''),
            'has_api_token': bool(cfg.get('api_token')),
            'has_client_token': bool(cfg.get('client_token')),
            'sender_name': cfg.get('sender_name', 'Igreja Batista da Lagoinha'),
            'enabled': bool(cfg.get('enabled', True)),
            'configured': is_provider_configured(cfg),
        }


@router.put('/config')
def update_whatsapp_config(data: WhatsAppConfigInput, user=Depends(session)):
    provider = data.provider.strip().lower()
    if provider not in PROVIDERS:
        fail('provider', 'Provedor inválido. Use evolution, zapi, meta ou webhook.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if not (platform_admin(c, user['id']) or is_pastor(c, user['id'])):
            fail('forbidden', 'Apenas Pastores e Admin TI podem configurar o provedor de WhatsApp.', 403)
        current = load_whatsapp_config(c)
        token_to_save = data.api_token.strip() if data.api_token.strip() else current.get('api_token', '')
        client_token_to_save = data.client_token.strip() if data.client_token.strip() else current.get('client_token', '')
        now = s.now()
        c.execute(
            '''INSERT INTO whatsapp_settings(id, provider, api_url, instance_id, api_token, client_token, sender_name, enabled, updated_by, updated_at)
               VALUES('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 provider=excluded.provider,
                 api_url=excluded.api_url,
                 instance_id=excluded.instance_id,
                 api_token=excluded.api_token,
                 client_token=excluded.client_token,
                 sender_name=excluded.sender_name,
                 enabled=excluded.enabled,
                 updated_by=excluded.updated_by,
                 updated_at=excluded.updated_at''',
            (
                provider,
                data.api_url.strip(),
                data.instance_id.strip(),
                encrypt_text(token_to_save) if token_to_save else '',
                encrypt_text(client_token_to_save) if client_token_to_save else '',
                data.sender_name.strip() or 'Igreja Batista da Lagoinha',
                1 if data.enabled else 0,
                user['id'],
                now,
            ),
        )
        s.audit(c, user['id'], f'whatsapp_config_updated:{provider}')
        updated = load_whatsapp_config(c)
        return {
            'ok': True,
            'configured': is_provider_configured(updated),
            'message': 'Configuração do WhatsApp salva com sucesso!',
        }


@router.post('/test')
def test_whatsapp_dispatch(data: WhatsAppTestInput, user=Depends(session)):
    norm = normalize_br_phone(data.phone)
    if not norm:
        fail('phone', 'Informe um número de WhatsApp válido com DDD (ex.: 33999112233).')
    with s.db() as c:
        if not (platform_admin(c, user['id']) or is_pastor(c, user['id'])):
            fail('forbidden', 'Apenas Pastores e Admin TI podem testar a conexão da API.', 403)
        cfg = load_whatsapp_config(c)
        recipient = {
            'key': norm,
            'name': data.name.strip(),
            'first_name': first_name_of(data.name),
            'phone': data.phone.strip(),
            'normalized_phone': norm,
            'sector_label': 'Lagoinha Systems',
        }
        rendered = render_personalized_message(data.message, recipient, auto_greet=True)
        ok, detail = send_via_provider(cfg, recipient, rendered)
        if not ok:
            fail('whatsapp_api', f'Falha no envio de teste: {detail}', 502)
        s.audit(c, user['id'], f'whatsapp_test_sent:{norm}')
        return {'ok': True, 'message': f'Mensagem de teste enviada para {norm}!', 'detail': detail}


@router.post('/send')
def send_whatsapp_batch(data: WhatsAppDispatchInput, user=Depends(session)):
    with s.db() as c:
        is_root, _, ministry_scope = require_leader(c, user, data.target_sector.strip())
        pool = collect_recipients(
            c,
            data.target_sector.strip(),
            data.target_group.strip(),
            '',
            ministry_scope if not is_root else '',
        )
        if data.recipient_keys:
            allowed_keys = set(data.recipient_keys)
            selected = [r for r in pool if r['key'] in allowed_keys]
        else:
            selected = pool

        if not selected:
            fail('recipients', 'Nenhum destinatário com número de WhatsApp válido foi selecionado.')

        cfg = load_whatsapp_config(c)
        configured = is_provider_configured(cfg)
        now = s.now()

        sent_count = 0
        failed_count = 0
        app_notified = 0
        results = []

        http_client = httpx.Client(timeout=12.0) if configured else None
        try:
            for r in selected:
                personalized = render_personalized_message(data.message, r, auto_greet=data.auto_greet)
                if configured:
                    ok, detail = send_via_provider(cfg, r, personalized, client=http_client)
                    if ok:
                        sent_count += 1
                    else:
                        failed_count += 1
                else:
                    ok = False
                    detail = 'API não conectada'
                    failed_count += 1

                if data.also_notify_app and r.get('user_id') and r['user_id'] != user['id']:
                    c.execute(
                        'INSERT INTO notifications(user_id, child_id, kind, title, message, sender, created_at) VALUES(?,?,?,?,?,?,?)',
                        (
                            r['user_id'],
                            None,
                            'whatsapp_notice',
                            f"💬 Mensagem de {user['name']}",
                            personalized[:240],
                            user['id'],
                            now,
                        ),
                    )
                    app_notified += 1

                results.append({
                    'key': r['key'],
                    'name': r['name'],
                    'phone': r['phone'],
                    'normalized_phone': r['normalized_phone'],
                    'message': personalized,
                    'sent': ok,
                    'detail': detail,
                })
        finally:
            if http_client:
                http_client.close()

        dispatch_id = secrets.token_hex(16)
        c.execute(
            '''INSERT INTO whatsapp_dispatches(id, sender_id, sender_name, target_sector, target_group, template_text, total_recipients, sent_count, failed_count, provider, created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
            (
                dispatch_id,
                user['id'],
                user['name'],
                data.target_sector.strip(),
                data.target_group.strip(),
                data.message.strip(),
                len(selected),
                sent_count,
                failed_count,
                cfg.get('provider', 'none') if configured else 'unconfigured',
                now,
            ),
        )
        s.audit(c, user['id'], f"whatsapp_batch:{dispatch_id}:{data.target_sector}:{sent_count}/{len(selected)}")

        if configured and sent_count == len(selected):
            summary_msg = f"✅ {sent_count} mensagem(ns) personalizada(s) enviada(s) automaticamente pelo WhatsApp!"
        elif configured and sent_count > 0:
            summary_msg = f"⚠️ {sent_count} enviada(s) via API e {failed_count} com falha."
        else:
            summary_msg = (
                f"Mensagens personalizadas preparadas para {len(selected)} pessoa(s)"
                + (f" e {app_notified} notificada(s) no App." if app_notified else ".")
                + " Configure a chave da API do WhatsApp para disparo 100% em segundo plano."
            )

        return {
            'ok': True,
            'dispatch_id': dispatch_id,
            'configured': configured,
            'total': len(selected),
            'sent_count': sent_count,
            'failed_count': failed_count,
            'app_notified': app_notified,
            'message': summary_msg,
            'results': results,
        }
