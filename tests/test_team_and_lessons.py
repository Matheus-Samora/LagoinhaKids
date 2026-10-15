import os, pytest
from test_app import records, client, PASSWORD
from backend import store as s

def test_team_access_and_management():
    admin = client(1)
    teacher = client(2)
    parent = client(3)

    # 1. Parent cannot access team
    assert parent.get('/api/team').status_code == 403
    assert parent.post('/api/team/member', json={'name':'Bad','email':'bad@test.test','password':PASSWORD}).status_code == 403

    # 2. Both admin and teacher can access team
    r_admin = admin.get('/api/team')
    assert r_admin.status_code == 200
    assert 'members' in r_admin.json() and 'candidates' in r_admin.json()

    r_teacher = teacher.get('/api/team')
    assert r_teacher.status_code == 200
    assert len(r_teacher.json()['members']) >= 2

    # 3. Teacher can create a new monitor
    new_mon = teacher.post('/api/team/member', json={
        'name': 'Monitor João',
        'email': 'joao.monitor@lagoinha.test',
        'password': PASSWORD,
        'staff_role': 'monitor',
        'rooms': [1]
    })
    assert new_mon.status_code == 200, new_mon.text
    mon_id = new_mon.json()['id']
    assert new_mon.json()['staff_role'] == 'monitor'

    # 4. Teacher cannot promote anyone to admin
    bad_admin = teacher.patch(f'/api/team/member/{mon_id}', json={'role': 'admin'})
    assert bad_admin.status_code == 403

    # 5. Teacher can delegate role to an existing parent
    candidates = teacher.get('/api/team').json()['candidates']
    if candidates:
        target_cand = candidates[0]['id']
        del_res = teacher.post('/api/team/delegate', json={
            'user_id': target_cand,
            'staff_role': 'monitor',
            'rooms': [1]
        })
        assert del_res.status_code == 200, del_res.text

def test_room_with_teacher_and_monitor():
    admin = client(1)
    # Create room with teacher and monitor
    res = admin.post('/api/rooms', json={
        'name': 'Turma Cordeiros',
        'min_age': 4,
        'max_age': 6,
        'capacity': 15,
        'teacher_id': 2,
        'monitor_id': 2
    })
    assert res.status_code == 200, res.text
    rid = res.json()['id']

    # Check that rooms return teacher and monitor
    rooms_data = admin.get('/api/rooms').json()
    cordeiros = next(r for r in rooms_data if r['id'] == rid)
    assert cordeiros['teacher_name'] != ''
    assert cordeiros['monitor_name'] != ''

def test_lesson_with_staff_materials_and_notes():
    admin = client(1)
    # Create lesson with teacher, monitor, materials and notes
    res = admin.post('/api/lessons', json={
        'room_id': 1,
        'title': 'Aulinha Davi e Golias',
        'starts_at': '2026-10-18T10:00:00-03:00',
        'ends_at': '2026-10-18T11:00:00-03:00',
        'repeat_weeks': 1,
        'teacher_id': 2,
        'materials_url': '/api/media/doc_exemplo.pdf',
        'notes': 'Trazer lápis de cor e tesoura sem ponta. Teremos atividade de colagem.'
    })
    assert res.status_code == 200, res.text
    lid = res.json()['id']

    # Verify lesson listing
    lessons = admin.get('/api/lessons').json()
    lesson = next(l for l in lessons if l['id'] == lid)
    assert lesson['title'] == 'Aulinha Davi e Golias'
    assert lesson['materials_url'] == '/api/media/doc_exemplo.pdf'
    assert 'Trazer lápis de cor' in lesson['notes']
    assert lesson['teacher_name'] != ''
