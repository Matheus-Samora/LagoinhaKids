from test_app import records, client
from test_basic_sectors import grant
from backend import store as s
from datetime import date


def test_member_profile_direct_save_without_pastoral_review(records):
    admin = client(1)
    member = client(3)

    # Initially member profile
    p0 = member.get('/api/me/profile').json()['user']
    assert p0['id'] == 3
    version = p0['profile_version']

    # Member saves personal data directly via /api/me/profile
    upd = member.patch('/api/me/profile', json={
        'version': version,
        'name': 'Membro Autônomo',
        'phone': '(33) 98888-7777',
        'birthday': '1995-08-20',
        'marital_status': 'Casado(a)',
        'profession': 'Designer',
        'address': 'Rua Central, 500'
    })
    assert upd.status_code == 200, upd.text
    u1 = upd.json()['user']
    assert u1['name'] == 'Membro Autônomo'
    assert u1['phone'] == '(33) 98888-7777'
    assert u1['birthday'] == '1995-08-20'
    assert u1['marital_status'] == 'Casado(a)'
    assert u1['profession'] == 'Designer'
    assert u1['address'] == 'Rua Central, 500'

    # Check that members_people record was updated/linked automatically
    with s.db() as c:
        p_row = c.execute("SELECT * FROM members_people WHERE account_user_id=? OR lower(email)=lower(?)", (3, u1['email'])).fetchone()
        assert p_row is not None
        assert p_row['name'] == 'Membro Autônomo'
        assert p_row['phone'] == '(33) 98888-7777'
        assert p_row['birthday'] == '1995-08-20'
        assert p_row['profession'] == 'Designer'


def test_ministry_schedule_notifications_on_create_edit_delete(records):
    admin = client(1)
    member = client(3)

    # Create a member record in members_people linked to user 3
    with s.db() as c:
        c.execute("UPDATE members_people SET account_user_id=3 WHERE lower(email)=lower(?)", (client(3).get('/api/me/profile').json()['user']['email'],))

    m_profile = member.get('/api/me/profile').json()['user']
    with s.db() as c:
        p = c.execute("SELECT id FROM members_people WHERE account_user_id=3").fetchone()
        if not p:
            c.execute("INSERT INTO members_people(id, name, email, account_user_id, active, version, created_at) VALUES('p-test-3', ?, ?, 3, 1, 1, ?)", (m_profile['name'], m_profile['email'], s.now()))
            pid = 'p-test-3'
        else:
            pid = p['id']

    # Leader creates schedule for member
    sch_res = admin.post('/api/ministries/schedules', json={
        'title': 'Culto de Celebração',
        'ministry': 'Music',
        'person_id': pid,
        'role_notes': 'Violão',
        'service_date': '2026-11-15',
        'service_time': '19:00',
        'status': 'confirmed'
    })
    assert sch_res.status_code == 200, sch_res.text
    sid = sch_res.json()['id']

    # Verify notification delivered to member
    notifs = member.get('/api/notification-center').json()
    sched_notifs = [n for n in notifs['items'] if n['kind'] == 'ministry_schedule']
    assert len(sched_notifs) >= 1
    assert 'Nova Escalação' in sched_notifs[0]['title']
    assert 'Violão' in sched_notifs[0]['message']

    # Edit schedule -> notification updated
    edit_res = admin.put(f'/api/ministries/schedules/{sid}', json={
        'version': 1,
        'title': 'Culto da Família',
        'ministry': 'Music',
        'person_id': pid,
        'role_notes': 'Guitarra',
        'service_date': '2026-11-15',
        'service_time': '18:00',
        'status': 'confirmed'
    })
    assert edit_res.status_code == 200, edit_res.text

    notifs2 = member.get('/api/notification-center').json()
    updated_notifs = [n for n in notifs2['items'] if 'Atualizada' in n['title']]
    assert len(updated_notifs) >= 1
    assert 'Guitarra' in updated_notifs[0]['message']

    # Delete schedule -> notification cancelled
    del_res = admin.delete(f'/api/ministries/schedules/{sid}?version=2')
    assert del_res.status_code == 200, del_res.text

    notifs3 = member.get('/api/notification-center').json()
    cancelled_notifs = [n for n in notifs3['items'] if 'Desmarcada' in n['title']]
    assert len(cancelled_notifs) >= 1


def test_viewer_can_view_ministry_programming_without_editing(records):
    admin = client(1)
    viewer = client(3)

    # Create a schedule as admin
    with s.db() as c:
        c.execute("INSERT INTO members_people(id, name, email, active, version, created_at) VALUES('p-intercessao', 'Maria Intercessora', 'maria@igreja.com', 1, 1, ?)", (s.now(),))
        pid = 'p-intercessao'

    sch = admin.post('/api/ministries/schedules', json={
        'title': 'Culto de Oração',
        'ministry': 'Intercessão',
        'person_id': pid,
        'role_notes': 'Recepção',
        'service_date': '2026-11-20',
        'service_time': '19:30',
        'status': 'confirmed'
    })
    assert sch.status_code == 200, sch.text

    # Grant user 3 viewer access in ministries
    grant(3, 'ministries', 'viewer')

    # Viewer reads ministries: CAN view schedules and programming!
    m_view = viewer.get('/api/ministries')
    assert m_view.status_code == 200, m_view.text
    data = m_view.json()
    assert 'schedules' in data
    assert any(s['title'] == 'Culto de Oração' for s in data['schedules'])
    assert 'resources' in data
    assert 'assignments' in data

    # But viewer CANNOT create or edit (403 Forbidden!)
    cant_create = viewer.post('/api/ministries/schedules', json={
        'title': 'Tentativa Inválida',
        'ministry': 'Intercessão',
        'person_id': pid,
        'role_notes': 'Tentativa',
        'service_date': '2026-11-20',
        'service_time': '19:30',
        'status': 'confirmed'
    })
    assert cant_create.status_code == 403
