from datetime import datetime, date
import secrets,time
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from . import store as s
from .app import session, staff, admin, fail, child_allowed, child_visible, room_allowed

router = APIRouter(prefix='/api')

class GuestCheckout(BaseModel):
    claim_code:str=Field(min_length=4,max_length=30)
    guardian_confirmed:bool=False

@router.post('/guests/{guest_id}/checkout')
def guest_checkout(guest_id:int,data:GuestCheckout,user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        guest=c.execute('SELECT * FROM guest_checkins WHERE id=?',(guest_id,)).fetchone()
        if not guest:fail('missing','Visitante não encontrado.',404)
        if not room_allowed(c,user,guest['room_id']):fail('scope','Visitante de outra turma.',403)
        key=s.digest(f'guest-checkout|{user["id"]}|{guest_id}')
        attempt=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
        failures=attempt['failures'] if attempt and attempt['expires']>time.time() else 0
        if failures>=6:fail('rate','Aguarde 15 minutos e procure a administração.',429)
        if not secrets.compare_digest(data.claim_code.strip().upper(),guest['claim_code']):
            c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,failures+1,int(time.time())+900))
            c.commit()
            fail('code','Código de retirada incorreto.',400)
        if not data.guardian_confirmed:fail('guardian','Confira presencialmente o responsável antes da saída.')
        if guest['status']=='departed':return {'ok':True,'status':'departed'}
        c.execute("UPDATE guest_checkins SET status='departed',out_at=?,checkout_actor=? WHERE id=?",(s.now(),user['id'],guest_id))
        c.execute('DELETE FROM attempts WHERE key=?',(key,))
        s.audit(c,user['id'],'guest_checkout')
    return {'ok':True,'status':'departed'}

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

    @model_validator(mode='after')
    def validate_schedule(self):
        try:
            start=datetime.fromisoformat(self.starts_at)
            end=datetime.fromisoformat(self.ends_at)
            zone=ZoneInfo('America/Sao_Paulo')
            start=start.replace(tzinfo=zone) if start.tzinfo is None else start.astimezone(zone)
            end=end.replace(tzinfo=zone) if end.tzinfo is None else end.astimezone(zone)
        except ValueError:raise ValueError('Informe datas e horários válidos.')
        if end<=start:raise ValueError('O término deve ocorrer depois do início.')
        if self.banner_url and not self.banner_url.startswith('https://'):raise ValueError('A imagem deve usar HTTPS.')
        self.starts_at=start.isoformat(timespec='seconds');self.ends_at=end.isoformat(timespec='seconds')
        return self

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

        booked=c.execute('SELECT count(*) FROM event_registrations WHERE event_id=?',(event_id,)).fetchone()[0]
        if data.max_capacity<booked:fail('capacity','A capacidade não pode ser menor que as inscrições existentes.',409)
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
        c.execute('BEGIN IMMEDIATE')
        event = c.execute('SELECT * FROM events WHERE id = ? AND active = 1', (event_id,)).fetchone()
        if not event:
            fail('event_not_found', 'Evento não encontrado ou inativo.', 404)

        child = child_allowed(c, user, data.child_id)
        age = age_on(child['birthday'], event['starts_at'])
        if age < event['min_age'] or age > event['max_age']:
            fail('age_mismatch', f'A idade de {child["name"]} ({age} anos) não está na faixa permitida ({event["min_age"]} a {event["max_age"]} anos).', 400)

        existing=c.execute('SELECT id FROM event_registrations WHERE event_id=? AND child_id=?',(event_id,data.child_id)).fetchone()
        if existing:return {'id':existing['id'],'ok':True,'status':'confirmed'}
        if event['ends_at']<s.now():fail('event_ended','Este evento já terminou.')
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
        if user['role']!='parent' and not room_allowed(c,user,lesson['room_id']):fail('scope','Aula de outra turma.',403)
        if user['role']=='parent':
            linked=c.execute('SELECT ch.* FROM children ch JOIN reservations r ON r.child_id=ch.id WHERE r.lesson_id=? AND r.confirmed=1',(lesson_id,)).fetchall()
            if not any(child_visible(c,user,ch) for ch in linked):fail('scope','Aula sem vínculo com sua família.',403)
        return dict(lesson)

@router.post('/lessons/{lesson_id}/curriculum')
def update_curriculum(lesson_id: int, data: CurriculumIn, user=Depends(staff)):
    now = s.now()
    with s.db() as c:
        lesson = c.execute('SELECT * FROM lessons WHERE id = ? AND active = 1', (lesson_id,)).fetchone()
        if not lesson:
            fail('lesson_not_found', 'Aula não encontrada ou cancelada.', 404)

        if not room_allowed(c,user,lesson['room_id']):fail('scope','Aula de outra turma.',403)
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
        child = child_allowed(c, user, data.child_id)
        if not child:
            fail('child_not_found', 'Criança não encontrada.', 404)

        claim_code = 'CH-' + secrets.token_hex(4).upper()
        existing=c.execute("SELECT * FROM paging_requests WHERE child_id=? AND status='active'",(data.child_id,)).fetchone()
        if existing:return dict(existing)

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
            SELECT p.*, ch.name AS child_name, rm.name AS room_name, u.name AS ack_user_name
            FROM paging_requests p
            JOIN children ch ON ch.id = p.child_id
            LEFT JOIN rooms rm ON rm.id = p.room_id
            LEFT JOIN users u ON u.id = p.acknowledged_by
            WHERE p.status IN ('active', 'on_my_way')
            ORDER BY p.id DESC
        ''').fetchall()
        return [dict(r) for r in rows if child_visible(c,user,c.execute("SELECT * FROM children WHERE id=?",(r["child_id"],)).fetchone())]

class PagingAckIn(BaseModel):
    child_id: int | None = None
    paging_id: int | None = None

@router.post('/paging/on-my-way')
def on_my_way(data: PagingAckIn, user=Depends(session)):
    now = s.now()
    with s.db() as c:
        p = None
        if data.paging_id:
            p = c.execute("SELECT * FROM paging_requests WHERE id=? AND status IN ('active','on_my_way')", (data.paging_id,)).fetchone()
        elif data.child_id:
            p = c.execute("SELECT * FROM paging_requests WHERE child_id=? AND status IN ('active','on_my_way') ORDER BY id DESC LIMIT 1", (data.child_id,)).fetchone()
        else:
            p = c.execute("""
                SELECT p.* FROM paging_requests p
                JOIN children ch ON ch.id=p.child_id
                WHERE ch.parent_id=? AND p.status IN ('active','on_my_way')
                ORDER BY p.id DESC LIMIT 1
            """, (user['id'],)).fetchone()

        if not p:
            fail('paging_not_found', 'Nenhum chamado ativo encontrado para esta solicitação.', 404)

        ch = c.execute("SELECT * FROM children WHERE id=?", (p['child_id'],)).fetchone()
        if not ch:
            fail('child_not_found', 'Criança não encontrada.', 404)

        c.execute("""
            UPDATE paging_requests
            SET status='on_my_way', acknowledged_at=?, acknowledged_by=?
            WHERE id=?
        """, (now, user['id'], p['id']))

        recipients = [r[0] for r in c.execute("SELECT DISTINCT user_id FROM teacher_rooms WHERE room_id=?", (p['room_id'],))]
        recipients += [r[0] for r in c.execute("SELECT id FROM users WHERE role='admin' AND active=1")]

        msg = f"O responsável {user['name']} confirmou que ESTÁ A CAMINHO para atender o chamado de {ch['name']}."
        for uid in set(recipients):
            c.execute("""
                INSERT INTO notifications(user_id, child_id, kind, title, message, sender, created_at)
                VALUES(?, ?, 'arriving', '🏃 Responsável a Caminho!', ?, ?, ?)
            """, (uid, ch['id'], msg, user['id'], now))

        c.execute("UPDATE notifications SET read_at=coalesce(read_at,?) WHERE user_id=? AND child_id=? AND kind='urgent_call'", (now, user['id'], ch['id']))
        s.audit(c, user['id'], 'paging_on_my_way', ch['id'])
        return {'ok': True, 'child_name': ch['name'], 'status': 'on_my_way', 'claim_code': p['claim_code']}

@router.post('/paging/{paging_id}/resolve')
def resolve_paging(paging_id: int, user=Depends(staff)):
    now = s.now()
    with s.db() as c:
        paging=c.execute('SELECT child_id FROM paging_requests WHERE id=?',(paging_id,)).fetchone()
        if not paging:fail('paging_not_found','Chamado não encontrado.',404)
        child_allowed(c,user,paging['child_id'])
        updated = c.execute('''
            UPDATE paging_requests
            SET status = 'resolved', resolved_at = ?
            WHERE id = ? AND status IN ('active', 'on_my_way')
        ''', (now, paging_id)).rowcount
        if not updated:
            fail('paging_not_found', 'Chamado não encontrado ou já resolvido.', 404)
        s.audit(c, user['id'], 'paging_resolve')
        return {'ok': True}

# --- Fast-Track de Visitantes ---

@router.post('/guests/checkin')
def guest_checkin(data: GuestCheckinIn, user=Depends(staff)):
    now = s.now()
    claim_code = 'VIS-' + secrets.token_hex(4).upper()
    with s.db() as c:
        if data.room_id is None or not room_allowed(c,user,data.room_id):fail('scope','Escolha uma turma sob sua responsabilidade.',403)
        room=c.execute('SELECT * FROM rooms WHERE id=?',(data.room_id,)).fetchone()
        if not room['min_age']<=data.child_age<=room['max_age']:fail('age','Idade incompatível com a turma.')
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
            WHERE g.created_at >= ? AND g.status='present'
            ORDER BY g.id DESC
        ''', (today,)).fetchall()
        return [{k:r[k] for k in r.keys() if k!='claim_code'} for r in rows if room_allowed(c,user,r['room_id'])]
