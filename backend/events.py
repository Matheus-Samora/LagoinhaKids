from datetime import datetime, date
import random
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from . import store as s
from .app import session, staff, admin, fail, child_allowed, child_visible

router = APIRouter(prefix='/api')

def age_on(birth, day):
    try:
        b = date.fromisoformat(str(birth)[:10])
        d = date.fromisoformat(str(day)[:10])
        return d.year - b.year - ((d.month, d.day) < (b.month, b.day))
    except Exception:
        return 0

class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=5, max_length=2000)
    category: str = Field(min_length=2, max_length=50)
    target_audience: str = Field(default="all", max_length=20)
    min_age: int = Field(default=0, ge=0, le=17)
    max_age: int = Field(default=17, ge=0, le=17)
    starts_at: str = Field(min_length=10, max_length=35)
    ends_at: str = Field(min_length=10, max_length=35)
    location: str = Field(default="", max_length=120)
    price: str = Field(default="Gratuito", max_length=60)
    max_capacity: int = Field(default=100, ge=1, le=1000)
    banner_url: str = Field(default="", max_length=300)

class EventRegisterIn(BaseModel):
    child_id: int
    notes: str = Field(default="", max_length=500)

class CurriculumIn(BaseModel):
    theme: str = Field(min_length=2, max_length=200)
    memory_verse: str = Field(default="", max_length=300)
    family_question: str = Field(default="", max_length=300)

class PagingCreate(BaseModel):
    child_id: int
    reason: str = Field(default="Acolhimento necessário", max_length=200)

class GuestCheckinIn(BaseModel):
    child_name: str = Field(min_length=2, max_length=100)
    child_age: int = Field(ge=0, le=17)
    guardian_name: str = Field(min_length=2, max_length=100)
    guardian_phone: str = Field(min_length=8, max_length=30)
    allergies: str = Field(default="", max_length=200)
    room_id: int | None = None

# --- Mural de Eventos (Kids & Teens) ---

@router.get('/events')
def list_events(audience: str | None = None, user=Depends(session)):
    with s.db() as c:
        query = '''
            SELECT e.*, COUNT(r.id) AS registrations_count
            FROM events e
            LEFT JOIN event_registrations r ON r.event_id = e.id
            WHERE e.active = 1
        '''
        params = []
        if audience and audience in ('kids', 'teens'):
            query += ' AND (e.target_audience = ? OR e.target_audience = "all")'
            params.append(audience)
        query += ' GROUP BY e.id ORDER BY e.starts_at ASC'
        events = [dict(row) for row in c.execute(query, params).fetchall()]

        user_regs = c.execute('''
            SELECT r.event_id, r.child_id
            FROM event_registrations r
            JOIN children ch ON ch.id = r.child_id
            WHERE ch.parent_id = ? OR EXISTS(
                SELECT 1 FROM family_links fl WHERE fl.child_id = ch.id AND fl.user_id = ? AND fl.active = 1
            )
        ''', (user['id'], user['id'])).fetchall()

        regs_map = {}
        for r in user_regs:
            regs_map.setdefault(r['event_id'], []).append(r['child_id'])

        for e in events:
            e['user_registered_children'] = regs_map.get(e['id'], [])

        return events

@router.post('/events')
def create_event(data: EventCreate, user=Depends(staff)):
    if data.max_age < data.min_age:
        fail('event', 'Faixa etária inválida: idade máxima menor que idade mínima.')

    audience = data.target_audience.lower()
    if audience not in ('all', 'kids', 'teens'):
        audience = 'all'

    now = s.now()
    with s.db() as c:
        cur = c.execute('''
            INSERT INTO events(
                title, description, category, target_audience,
                min_age, max_age, starts_at, ends_at,
                location, price, max_capacity, banner_url,
                active, created_by, created_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ''', (
            data.title.strip(), data.description.strip(), data.category.strip(),
            audience, data.min_age, data.max_age,
            data.starts_at, data.ends_at, data.location.strip(),
            data.price.strip(), data.max_capacity, data.banner_url.strip(),
            user['id'], now
        ))
        event_id = cur.lastrowid

        # Notificação de transmissão para todos os pais
        parents = c.execute('SELECT id FROM users WHERE role = "parent" AND active = 1').fetchall()
        for p in parents:
            desc_preview = (data.description[:100] + '...') if len(data.description) > 100 else data.description
            c.execute('''
                INSERT INTO notifications(user_id, kind, title, message, sender, created_at)
                VALUES(?, ?, ?, ?, ?, ?)
            ''', (
                p['id'],
                'event_announcement',
                f'🎉 Novo Evento: {data.title.strip()}',
                f'{desc_preview} Inscrições abertas no Mural!',
                user['id'],
                now
            ))

        s.audit(c, user['id'], 'create_event')
        return {'id': event_id, 'ok': True}

@router.patch('/events/{event_id}')
def update_event(event_id: int, data: EventCreate, user=Depends(staff)):
    if data.max_age < data.min_age:
        fail('event', 'Faixa etária inválida: idade máxima menor que idade mínima.')

    audience = data.target_audience.lower()
    if audience not in ('all', 'kids', 'teens'):
        audience = 'all'

    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        ev = c.execute('SELECT * FROM events WHERE id = ? AND active = 1', (event_id,)).fetchone()
        if not ev:
            fail('event_not_found', 'Evento não encontrado ou inativo.', 404)

        c.execute('''
            UPDATE events SET
                title = ?, description = ?, category = ?, target_audience = ?,
                min_age = ?, max_age = ?, starts_at = ?, ends_at = ?,
                location = ?, price = ?, max_capacity = ?, banner_url = ?
            WHERE id = ?
        ''', (
            data.title.strip(), data.description.strip(), data.category.strip(),
            audience, data.min_age, data.max_age,
            data.starts_at, data.ends_at, data.location.strip(),
            data.price.strip(), data.max_capacity, data.banner_url.strip(),
            event_id
        ))
        s.audit(c, user['id'], 'update_event')
        return {'id': event_id, 'ok': True}

@router.delete('/events/{event_id}')
def delete_event(event_id: int, user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        ev = c.execute('SELECT * FROM events WHERE id = ?', (event_id,)).fetchone()
        if not ev:
            fail('event_not_found', 'Evento não encontrado.', 404)
        c.execute('UPDATE events SET active = 0 WHERE id = ?', (event_id,))
        s.audit(c, user['id'], 'delete_event')
        return {'ok': True}

@router.post('/events/{event_id}/register')
def register_for_event(event_id: int, data: EventRegisterIn, user=Depends(session)):
    now = s.now()
    with s.db() as c:
        event = c.execute('SELECT * FROM events WHERE id = ? AND active = 1', (event_id,)).fetchone()
        if not event:
            fail('event_not_found', 'Evento não encontrado ou inativo.', 404)

        child = child_allowed(c, user, data.child_id)
        age = age_on(child['birthday'], event['starts_at'])
        if age < event['min_age'] or age > event['max_age']:
            fail('age_mismatch', f'A idade de {child["name"]} ({age} anos) não está na faixa permitida ({event["min_age"]} a {event["max_age"]} anos).', 400)

        count = c.execute('SELECT COUNT(*) FROM event_registrations WHERE event_id = ?', (event_id,)).fetchone()[0]
        if count >= event['max_capacity']:
            fail('capacity_full', 'Vagas esgotadas para este evento.', 400)

        existing = c.execute('SELECT id FROM event_registrations WHERE event_id = ? AND child_id = ?', (event_id, data.child_id)).fetchone()
        if existing:
            fail('already_registered', f'{child["name"]} já está inscrito(a) neste evento.', 400)

        cur = c.execute('''
            INSERT INTO event_registrations(event_id, child_id, guardian_id, notes, created_at)
            VALUES(?, ?, ?, ?, ?)
        ''', (event_id, data.child_id, user['id'], data.notes.strip(), now))
        reg_id = cur.lastrowid

        c.execute('''
            INSERT INTO notifications(user_id, child_id, kind, title, message, sender, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
        ''', (
            user['id'],
            data.child_id,
            'event_registration',
            'Inscrição Confirmada! 🎉',
            f'{child["name"]} está confirmado(a) em {event["title"]}.',
            user['id'],
            now
        ))

        s.audit(c, user['id'], 'event_register', data.child_id)
        return {'id': reg_id, 'event_id': event_id, 'child_id': data.child_id, 'status': 'confirmed', 'ok': True}

@router.delete('/events/{event_id}/register/{child_id}')
def cancel_event_registration(event_id: int, child_id: int, user=Depends(session)):
    with s.db() as c:
        child_allowed(c, user, child_id)
        deleted = c.execute('DELETE FROM event_registrations WHERE event_id = ? AND child_id = ?', (event_id, child_id)).rowcount
        if not deleted:
            fail('not_registered', 'Inscrição não encontrada.', 404)
        s.audit(c, user['id'], 'cancel_event_register', child_id)
        return {'ok': True}

# --- Discipulado & Conexão Familiar ("O que meu filho aprendeu hoje?") ---

@router.get('/lessons/{lesson_id}/curriculum')
def get_curriculum(lesson_id: int, user=Depends(session)):
    with s.db() as c:
        lesson = c.execute('SELECT id, title, room_id, starts_at, theme, memory_verse, family_question FROM lessons WHERE id = ?', (lesson_id,)).fetchone()
        if not lesson:
            fail('lesson_not_found', 'Aula não encontrada.', 404)
        return dict(lesson)

@router.post('/lessons/{lesson_id}/curriculum')
def update_curriculum(lesson_id: int, data: CurriculumIn, user=Depends(staff)):
    now = s.now()
    with s.db() as c:
        lesson = c.execute('SELECT * FROM lessons WHERE id = ? AND active = 1', (lesson_id,)).fetchone()
        if not lesson:
            fail('lesson_not_found', 'Aula não encontrada ou cancelada.', 404)

        c.execute('''
            UPDATE lessons
            SET theme = ?, memory_verse = ?, family_question = ?
            WHERE id = ?
        ''', (data.theme.strip(), data.memory_verse.strip(), data.family_question.strip(), lesson_id))

        # Notificar pais com filhos inscritos nesta aula
        parents = c.execute('''
            SELECT DISTINCT ch.parent_id, ch.id AS child_id, ch.name AS child_name
            FROM reservations r
            JOIN children ch ON ch.id = r.child_id
            WHERE r.lesson_id = ? AND r.confirmed = 1 AND ch.parent_id IS NOT NULL
        ''', (lesson_id,)).fetchall()

        msg = f'Tema: {data.theme.strip()}.\nVersículo: "{data.memory_verse.strip()}".\nEm família: {data.family_question.strip()}'
        for p in parents:
            c.execute('''
                INSERT INTO notifications(user_id, child_id, kind, title, message, sender, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
            ''', (
                p['parent_id'],
                p['child_id'],
                'discipleship',
                '📖 O que seu filho aprendeu hoje!',
                msg,
                user['id'],
                now
            ))

        s.audit(c, user['id'], 'update_curriculum')
        return {'ok': True, 'theme': data.theme, 'memory_verse': data.memory_verse, 'family_question': data.family_question}

# --- Paging System ("Chamar no Telão") ---

@router.post('/paging')
def trigger_paging(data: PagingCreate, user=Depends(staff)):
    now = s.now()
    with s.db() as c:
        child = c.execute('SELECT * FROM children WHERE id = ? AND archived = 0', (data.child_id,)).fetchone()
        if not child:
            fail('child_not_found', 'Criança não encontrada.', 404)

        # Buscar claim_code de atendimento ativo ou gerar código de chamada
        att = c.execute('''
            SELECT claim_code FROM attendance
            WHERE child_id = ?
            ORDER BY day DESC, in_at DESC LIMIT 1
        ''', (data.child_id,)).fetchone()
        claim_code = (att['claim_code'] if att and att['claim_code'] else f"LK-{random.randint(100, 999)}")

        cur = c.execute('''
            INSERT INTO paging_requests(child_id, room_id, claim_code, reason, status, created_at, actor)
            VALUES(?, ?, ?, ?, 'active', ?, ?)
        ''', (data.child_id, child['room_id'], claim_code, data.reason.strip(), now, user['id']))
        paging_id = cur.lastrowid

        # Notificação urgente para o responsável
        if child['parent_id']:
            c.execute('''
                INSERT INTO notifications(user_id, child_id, kind, title, message, sender, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
            ''', (
                child['parent_id'],
                child['id'],
                'urgent_call',
                '⚠️ Chamado no Telão - Ministério Infantil',
                f'Atenção responsável: Por favor, dirija-se à sala da criança. Motivo: {data.reason.strip()}. Código: {claim_code}',
                user['id'],
                now
            ))

        s.audit(c, user['id'], 'paging_call', data.child_id)
        return {
            'id': paging_id,
            'child_id': data.child_id,
            'child_name': child['name'],
            'claim_code': claim_code,
            'reason': data.reason.strip(),
            'status': 'active',
            'created_at': now
        }

@router.get('/paging/active')
def get_active_paging(user=Depends(session)):
    with s.db() as c:
        rows = c.execute('''
            SELECT p.*, ch.name AS child_name, rm.name AS room_name
            FROM paging_requests p
            JOIN children ch ON ch.id = p.child_id
            LEFT JOIN rooms rm ON rm.id = p.room_id
            WHERE p.status = 'active'
            ORDER BY p.id DESC
        ''').fetchall()
        return [dict(r) for r in rows]

@router.post('/paging/{paging_id}/resolve')
def resolve_paging(paging_id: int, user=Depends(staff)):
    now = s.now()
    with s.db() as c:
        updated = c.execute('''
            UPDATE paging_requests
            SET status = 'resolved', resolved_at = ?
            WHERE id = ? AND status = 'active'
        ''', (now, paging_id)).rowcount
        if not updated:
            fail('paging_not_found', 'Chamado não encontrado ou já resolvido.', 404)
        s.audit(c, user['id'], 'paging_resolve')
        return {'ok': True}

# --- Fast-Track de Visitantes ---

@router.post('/guests/checkin')
def guest_checkin(data: GuestCheckinIn, user=Depends(staff)):
    now = s.now()
    claim_code = f"VIS-{random.randint(100, 999)}"
    with s.db() as c:
        cur = c.execute('''
            INSERT INTO guest_checkins(
                child_name, child_age, guardian_name, guardian_phone,
                allergies, room_id, claim_code, created_at, actor
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.child_name.strip(),
            data.child_age,
            data.guardian_name.strip(),
            data.guardian_phone.strip(),
            data.allergies.strip(),
            data.room_id,
            claim_code,
            now,
            user['id']
        ))
        guest_id = cur.lastrowid
        s.audit(c, user['id'], 'guest_checkin')
        return {
            'id': guest_id,
            'child_name': data.child_name.strip(),
            'child_age': data.child_age,
            'guardian_name': data.guardian_name.strip(),
            'guardian_phone': data.guardian_phone.strip(),
            'claim_code': claim_code,
            'room_id': data.room_id,
            'created_at': now,
            'ok': True
        }

@router.get('/guests/active')
def list_active_guests(user=Depends(staff)):
    today = s.today()
    with s.db() as c:
        rows = c.execute('''
            SELECT g.*, rm.name as room_name
            FROM guest_checkins g
            LEFT JOIN rooms rm ON rm.id = g.room_id
            WHERE g.created_at >= ?
            ORDER BY g.id DESC
        ''', (today,)).fetchall()
        return [dict(r) for r in rows]
