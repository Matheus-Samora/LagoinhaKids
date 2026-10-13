from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sqlite3
from test_app import records,client,PASSWORD
from backend import store as s

def schedule(room=1,offset=1,start=10):
    d=(datetime.now(ZoneInfo('America/Sao_Paulo'))+timedelta(days=offset)).replace(hour=start,minute=0,second=0,microsecond=0)
    return {'room_id':room,'title':'Aula de teste','starts_at':d.isoformat(),'ends_at':(d+timedelta(hours=1)).isoformat()}
def add_lesson(c,**kw):
    r=c.post('/api/lessons',json=schedule(**kw));assert r.status_code==200,r.text
    return r.json()['id']

def test_parent_self_registration_and_editing():
    p=client(3)
    data={'name':'Filho fictício','birthday':'2022-06-10'}
    r=p.post('/api/children',json=data);assert r.status_code==200,r.text
    cid=r.json()['id']
    with s.db() as c:
        row=c.execute('SELECT * FROM children WHERE id=?',(cid,)).fetchone()
        assert row['parent_id']==3 and row['room_id'] is None
    assert client(4).patch(f'/api/children/{cid}',json=data).status_code==403
    assert p.patch(f'/api/children/{cid}',json=data|{'name':'Nome atualizado'}).status_code==200
    assert p.post('/api/children',json=data|{'parent_id':4}).status_code==403
    assert p.post('/api/children',json=data|{'room_id':2}).status_code==403
    assert p.delete(f'/api/children/{cid}').status_code==200
    assert cid not in [ch['id'] for ch in p.get('/api/children').json()]

def test_teacher_owns_created_classroom_and_cannot_edit_another():
    t=client(2);a=client()
    data={'name':'Minha nova turma','min_age':2,'max_age':6,'capacity':10}
    r=t.post('/api/rooms',json=data);assert r.status_code==200
    rid=r.json()['id']
    with s.db() as c:assert c.execute('SELECT created_by FROM rooms WHERE id=?',(rid,)).fetchone()[0]==2
    assert t.patch(f'/api/rooms/{rid}',json=data|{'name':'Turma renomeada'}).status_code==200
    foreign=a.post('/api/rooms',json=data).json()['id']
    assert t.patch(f'/api/rooms/{foreign}',json=data).status_code==403
    assert t.post('/api/rooms',json=data|{'owner_id':1}).status_code==403
    assert client(3).post('/api/rooms',json=data).status_code==403
    assert a.patch(f'/api/rooms/{rid}',json=data|{'name':'Editada pela administração'}).status_code==200
    with s.db() as c:assert c.execute('SELECT created_by FROM rooms WHERE id=?',(rid,)).fetchone()[0]==2

def test_teacher_created_lessons_age_capacity_and_actual_attendance_separate():
    t=client(2);p=client(3)
    lid=add_lesson(t)
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':1}).status_code==200
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':1}).json()['already_confirmed']
    assert p.get('/api/children').json()[0]['status']=='absent'
    assert t.get(f'/api/children?lesson_id={lid}').json()[0]['id']==1
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':2}).status_code==403
    assert p.delete(f'/api/lessons/{lid}/presence/1').status_code==200
    assert t.get(f'/api/children?lesson_id={lid}').json()==[]

def test_new_parent_child_becomes_visible_only_after_booking():
    t=client(2);p=client(3)
    cid=p.post('/api/children',json={'name':'Aluno sem turma','birthday':'2021-01-01'}).json()['id']
    assert cid not in [ch['id'] for ch in t.get('/api/children').json()]
    lid=add_lesson(t)
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':cid}).status_code==200
    assert cid in [ch['id'] for ch in t.get('/api/children').json()]
    assert p.post(f'/api/children/{cid}/notify',json={'kind':'pickup_ready'}).status_code==200
    assert t.get('/api/notifications').json()[0]['child_id']==cid

def test_age_and_schedule_conflicts():
    t=client(2);p=client(3);a=client()
    lid=add_lesson(t)
    assert t.post('/api/lessons',json=schedule()).status_code==409
    with s.db() as c:c.execute('UPDATE children SET birthday="2012-01-01" WHERE id=1')
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':1}).status_code==400
    with s.db() as c:c.execute('UPDATE children SET birthday="2021-01-01" WHERE id=1')
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':1}).status_code==200
    other=add_lesson(a,room=2)
    assert p.post(f'/api/lessons/{other}/presence',json={'child_id':1}).status_code==409
    bad=schedule(start=11);bad['ends_at']=bad['starts_at']
    assert t.post('/api/lessons',json=bad).status_code==400
    assert t.post('/api/lessons',json=schedule(room=2)).status_code==403
    assert p.post('/api/lessons',json=schedule()).status_code==403

def test_concurrent_last_seat_is_not_overbooked():
    t=client(2);p1=client(3);p2=client(4)
    with s.db() as c:c.execute('UPDATE rooms SET capacity=1 WHERE id=1')
    lid=add_lesson(t)
    def book(pair):
        c,cid=pair
        return c.post(f'/api/lessons/{lid}/presence',json={'child_id':cid}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:statuses=list(pool.map(book,[(p1,1),(p2,2)]))
    assert sorted(statuses)==[200,409]
    with s.db() as c:assert c.execute('SELECT count(*) FROM reservations WHERE confirmed=1 AND lesson_id=?',(lid,)).fetchone()[0]==1

def test_expired_lesson_and_capacity_edit_guard():
    t=client(2);p=client(3)
    lid=add_lesson(t)
    p.post(f'/api/lessons/{lid}/presence',json={'child_id':1})
    with s.db() as c:c.execute('UPDATE lessons SET ends_at="2020-01-01T11:00:00-03:00" WHERE id=?',(lid,))
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':1}).status_code==409
    assert lid not in [l['id'] for l in p.get('/api/lessons').json()]

def test_cancelled_lesson_notifies_family_and_preserves_history():
    t=client(2);p=client(3)
    lid=add_lesson(t);p.post(f'/api/lessons/{lid}/presence',json={'child_id':1})
    assert t.delete('/api/rooms/1').status_code==409
    assert t.delete(f'/api/lessons/{lid}').status_code==200
    assert p.get('/api/notifications').json()[0]['kind']=='lesson_update'
    assert t.delete('/api/rooms/1').status_code==200
    with s.db() as c:
        assert c.execute('SELECT 1 FROM children WHERE id=1').fetchone()
        assert c.execute('SELECT confirmed FROM reservations WHERE child_id=1 AND lesson_id=?',(lid,)).fetchone()[0]==0

def test_teacher_cannot_operate_foreign_lesson_or_archive_family_record():
    a=client();t=client(2);lid=add_lesson(a,room=2)
    assert t.patch(f'/api/lessons/{lid}',json=schedule(room=2,start=11)).status_code==403
    assert t.delete(f'/api/lessons/{lid}').status_code==403
    assert t.get(f'/api/children?lesson_id={lid}').status_code==403
    assert t.delete('/api/children/1').status_code==403

def test_admin_role_change_and_classroom_transfer():
    a=client();t=client(2)
    uid=a.post('/api/users',json={'name':'Outro professor','email':'outro@e.test','password':PASSWORD,'role':'teacher'}).json()['id']
    assert a.patch('/api/rooms/1',json={'name':'Turma transferida','min_age':2,'max_age':6,'capacity':10,'owner_id':uid}).status_code==200
    assert 1 not in [r['id'] for r in t.get('/api/rooms').json()]
    assert a.patch(f'/api/users/{uid}',json={'active':True,'role':'admin','rooms':[]}).status_code==200
    with s.db() as c:assert c.execute('SELECT role FROM users WHERE id=?',(uid,)).fetchone()[0]=='admin'

def test_migration_preserves_children_and_foreign_keys(tmp_path,monkeypatch):
    path=tmp_path/'legacy.sqlite3'
    with sqlite3.connect(path) as c:
        c.executescript('''
        CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT);
        CREATE TABLE rooms(id INTEGER PRIMARY KEY,name TEXT,min_age INTEGER,max_age INTEGER,capacity INTEGER,color TEXT);
        CREATE TABLE teacher_rooms(user_id INTEGER,room_id INTEGER);
        CREATE TABLE children(id INTEGER PRIMARY KEY,name TEXT NOT NULL,birthday TEXT NOT NULL,room_id INTEGER NOT NULL REFERENCES rooms(id),parent_id INTEGER REFERENCES users(id),face_allowed INTEGER NOT NULL DEFAULT 0,face_template BLOB,consent_at TEXT,created_at TEXT NOT NULL);
        CREATE TABLE attendance(child_id INTEGER REFERENCES children(id),day TEXT);
        INSERT INTO users VALUES(1,'admin');INSERT INTO users VALUES(2,'teacher');
        INSERT INTO rooms VALUES(1,'Turma antiga',2,6,10,'#000');INSERT INTO teacher_rooms VALUES(2,1);
        INSERT INTO children VALUES(1,'Aluno antigo','2021-01-01',1,1,1,X'010203','2026-01-01','2026-01-01');
        INSERT INTO attendance VALUES(1,'2026-01-01');
        ''')
    monkeypatch.setattr(s,'DB',path)
    s.migrate_school();s.migrate_school()
    with sqlite3.connect(path) as c:
        assert c.execute('SELECT face_template FROM children WHERE id=1').fetchone()[0]==b'\x01\x02\x03'
        assert c.execute('SELECT count(*) FROM attendance').fetchone()[0]==1
        assert c.execute('SELECT created_by FROM rooms WHERE id=1').fetchone()[0]==2
        assert next(row for row in c.execute('PRAGMA table_info(children)') if row[1]=='room_id')[3]==0
        assert c.execute('PRAGMA foreign_key_check').fetchall()==[]

def test_allergies_claim_codes_and_privacy():
    admin=client(1);teacher=client(2);parent=client(3)
    # 1. Parent registers child with allergy and medical alert
    r=parent.post('/api/children',json={
        'name':'Davi Oliveira',
        'birthday':'2022-04-10',
        'allergies':'Amendoim, Frutos do mar',
        'medical_conditions':'Asma crônica',
        'emergency_medication':'Bombinha Salbutamol na mochila',
        'special_needs':'Sensibilidade a ruídos',
        'authorized_pickups':'Vovó Cristina (RG 12345)'
    })
    assert r.status_code==200
    cid=r.json()['id']
    child=next(ch for ch in parent.get('/api/children').json() if ch['id']==cid)
    assert child['allergies']=='Amendoim, Frutos do mar'
    assert child['medical_conditions']=='Asma crônica'
    assert child['authorized_pickups']=='Vovó Cristina (RG 12345)'

    # 2. Privacy policy endpoint
    p_terms=parent.get('/api/terms/privacy')
    assert p_terms.status_code==200
    assert 'Política de Privacidade' in p_terms.json()['title']

    # 3. Check-in generates claim code
    r_in=admin.post(f'/api/children/{cid}/attendance',json={'action':'in','guardian_id':3,'guardian_confirmed':True})
    assert r_in.status_code==200
    claim_code=r_in.json()['claim_code']
    assert len(claim_code)==4

    # 4. Check-out rejects wrong claim code
    r_bad=admin.post(f'/api/children/{cid}/attendance',json={'action':'out','guardian_id':3,'guardian_confirmed':True,'claim_code':'ZZZZ'})
    assert r_bad.status_code==403

    # 5. Check-out succeeds with matching claim code
    r_out=admin.post(f'/api/children/{cid}/attendance',json={'action':'out','guardian_id':3,'guardian_confirmed':True,'claim_code':claim_code})
    assert r_out.status_code==200

