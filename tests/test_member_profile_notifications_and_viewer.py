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
        c.execute("INSERT INTO members_people(id,name,phone,email,active,version,created_at,account_user_id) VALUES('p-test-3','Membro Três','(33) 9111-2222','parent.one@example.com',1,1,?,3)", (s.now(),))

    # 1. Admin creates a schedule for user 3
    create_res = admin.post('/api/ministries/schedules', json={
        'title': 'Culto de Celebração',
        'ministry': 'Music',
        'person_id': 'p-test-3',
        'role_notes': 'Guitarra',
        'service_date': '2026-11-15',
        'service_time': '18:00',
        'status': 'confirmed'
    })
    assert create_res.status_code == 200, create_res.text
    sch_id = create_res.json()['id']

    # Verify notification was generated for user 3
    with s.db() as c:
        n1 = c.execute("SELECT * FROM notifications WHERE user_id=3 ORDER BY id DESC LIMIT 1").fetchone()
        assert n1 is not None
        assert 'Nova Escalação' in n1['title']
        assert 'Music' in n1['title']
        assert '15/11' in n1['message']
        assert 'Guitarra' in n1['message']

    # 2. Admin edits schedule (changes time/notes)
    edit_res = admin.put(f'/api/ministries/schedules/{sch_id}', json={
        'version': 1,
        'title': 'Culto de Celebração',
        'ministry': 'Music',
        'person_id': 'p-test-3',
        'role_notes': 'Violão e Guitarra',
        'service_date': '2026-11-15',
        'service_time': '19:30',
        'status': 'confirmed'
    })
    assert edit_res.status_code == 200, edit_res.text

    with s.db() as c:
        n2 = c.execute("SELECT * FROM notifications WHERE user_id=3 ORDER BY id DESC LIMIT 1").fetchone()
        assert n2 is not None
        assert 'Escalação Atualizada' in n2['title']
        assert '19:30' in n2['message']

    # 3. Admin deletes/archives schedule
    del_res = admin.delete(f'/api/ministries/schedules/{sch_id}?version=2')
    assert del_res.status_code == 200, del_res.text

    with s.db() as c:
        n3 = c.execute("SELECT * FROM notifications WHERE user_id=3 ORDER BY id DESC LIMIT 1").fetchone()
        assert n3 is not None
        assert 'Escalação Desmarcada' in n3['title']


def test_viewer_can_view_ministry_programming_without_editing(records):
    admin = client(1)
    viewer = client(3)

    # Insert a person and schedule
    pid = 'person-for-viewer-test'
    with s.db() as c:
        c.execute("INSERT INTO members_people(id,name,phone,email,active,version,created_at) VALUES(?,'Irmão Pedro','(33) 9999-1111','pedro@lagoinha.test',1,1,?)", (pid, s.now()))

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


def test_viewer_can_update_own_family_and_bio_in_profile(records):
    viewer = client(3)
    p0 = viewer.get('/api/me/profile').json()
    u0 = p0['user']
    version = u0['profile_version']

    # Update profile with bio, family_id or new_family_name
    upd = viewer.patch('/api/me/profile', json={
        'version': version,
        'bio': 'Apaixonado pela presença de Deus, servindo no louvor.',
        'new_family_name': 'Família Santos Oliveira'
    })
    assert upd.status_code == 200, upd.text
    u1 = upd.json()['user']
    assert u1['bio'] == 'Apaixonado pela presença de Deus, servindo no louvor.'
    assert u1['family_name'] == 'Família Santos Oliveira'

    # Check database
    with s.db() as c:
        p_row = c.execute("SELECT * FROM members_people WHERE account_user_id=3").fetchone()
        assert p_row is not None
        assert p_row['bio'] == 'Apaixonado pela presença de Deus, servindo no louvor.'
        f_row = c.execute("SELECT name FROM members_families WHERE id=?", (p_row['family_id'],)).fetchone()
        assert f_row['name'] == 'Família Santos Oliveira'


def test_viewer_can_respond_to_own_schedule_confirm_or_decline(records):
    admin = client(1)
    viewer = client(3)

    # Ensure member profile exists for user 3
    u_prof = viewer.get('/api/me/profile').json()['user']
    viewer.patch('/api/me/profile', json={
        'version': u_prof['profile_version'],
        'name': 'Membro Teste Três'
    })

    with s.db() as c:
        p_row = c.execute("SELECT id FROM members_people WHERE account_user_id=3").fetchone()
        assert p_row is not None
        pid = p_row['id']

    # Admin schedules user 3
    sch_res = admin.post('/api/ministries/schedules', json={
        'title': 'Culto da Família',
        'ministry': 'Intercessão',
        'person_id': pid,
        'role_notes': 'Oração no altar',
        'service_date': '2026-11-25',
        'service_time': '18:00',
        'status': 'pending'
    })
    assert sch_res.status_code == 200, sch_res.text
    sid = sch_res.json()['id']

    # Grant user 3 only viewer role in ministries
    grant(3, 'ministries', 'viewer')

    # User 3 checks /my-schedules
    my_s = viewer.get('/api/ministries/my-schedules').json()
    assert any(x['id'] == sid for x in my_s['schedules'])

    # User 3 confirms participation
    resp1 = viewer.post(f'/api/ministries/schedules/{sid}/respond', json={
        'status': 'confirmed'
    })
    assert resp1.status_code == 200, resp1.text
    assert resp1.json()['status'] == 'confirmed'

    with s.db() as c:
        assert c.execute("SELECT status FROM ministries_schedules WHERE id=?", (sid,)).fetchone()['status'] == 'confirmed'

    # User 3 later informs unavailability (declined) with reason
    resp2 = viewer.post(f'/api/ministries/schedules/{sid}/respond', json={
        'status': 'declined',
        'reason': 'Viagem a trabalho'
    })
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()['status'] == 'declined'

    with s.db() as c:
        row = c.execute("SELECT status, role_notes FROM ministries_schedules WHERE id=?", (sid,)).fetchone()
        assert row['status'] == 'declined'
        assert '[Obs: Viagem a trabalho]' in row['role_notes']

    # Another user (user 2) tries to respond to user 3's schedule -> 403 Forbidden!
    other_user = client(2)
    resp3 = other_user.post(f'/api/ministries/schedules/{sid}/respond', json={
        'status': 'confirmed'
    })
    assert resp3.status_code == 403


def test_hall_of_members_endpoint(records):
    viewer = client(3)
    # Ensure user 3 has profile saved
    u_prof = viewer.get('/api/me/profile').json()['user']
    viewer.patch('/api/me/profile', json={
        'version': u_prof['profile_version'],
        'name': 'Irmão Três',
        'bio': 'Membro da igreja Lagoinha'
    })

    grant(3, 'members', 'viewer')

    res = viewer.get('/api/members/hall')
    assert res.status_code == 200, res.text
    hall = res.json()
    assert 'members' in hall
    assert 'total' in hall
    assert hall['total'] >= 1
    # Check that user 3 appears with bio and is_me=True
    me = next((m for m in hall['members'] if m['is_me']), None)
    assert me is not None
    assert 'bio' in me
    assert me['bio'] == 'Membro da igreja Lagoinha'
    assert 'ministries' in me


def test_viewer_can_edit_own_person_record_in_members_module(records):
    admin = client(1)
    viewer = client(3)

    # Ensure user 3 has profile saved
    u_prof = viewer.get('/api/me/profile').json()['user']
    viewer.patch('/api/me/profile', json={
        'version': u_prof['profile_version'],
        'name': 'Irmão Três',
        'phone': '(33) 98888-1111'
    })

    with s.db() as c:
        p_row = c.execute('SELECT id, version FROM members_people WHERE account_user_id=3').fetchone()
        pid = p_row['id']
        p_ver = p_row['version']

    # User 3 has viewer role in members
    grant(3, 'members', 'viewer')

    # User 3 edits their OWN person record via PUT /api/members/people/{pid}
    edit_res = viewer.put(f'/api/members/people/{pid}', json={
        'version': p_ver,
        'name': 'Irmão Três Atualizado',
        'phone': '(33) 97777-2222',
        'relationship': 'Membro Ativo'
    })
    assert edit_res.status_code == 200, edit_res.text
    assert edit_res.json()['id'] == pid

    with s.db() as c:
        updated = c.execute('SELECT name, phone FROM members_people WHERE id=?', (pid,)).fetchone()
        assert updated['name'] == 'Irmão Três Atualizado'
        assert updated['phone'] == '(33) 97777-2222'

    # Admin creates another person record
    other_pid = 'person-other-member'
    with s.db() as c:
        c.execute("INSERT INTO members_people(id,name,phone,email,active,version,created_at) VALUES(?,'Outro Membro','(33) 9000-0000','outro@lagoinha.test',1,1,?)", (other_pid, s.now()))

    # User 3 tries to edit another person's record -> 403 Forbidden!
    cant_edit_other = viewer.put(f'/api/members/people/{other_pid}', json={
        'version': 1,
        'name': 'Tentativa Invasão'
    })
    assert cant_edit_other.status_code == 403


def test_schedule_confirmation_and_decline_modal_behavior(records):
    admin = client(1)
    volunteer = client(3)
    stranger = client(2)

    # Link user 3 to a person record
    with s.db() as c:
        c.execute("INSERT OR REPLACE INTO members_people(id,name,phone,email,active,version,created_at,account_user_id) VALUES('p-vol-3','Voluntário Três','(33) 9999-3333','parent.one@example.com',1,1,?,3)", (s.now(),))

    # Leader for Music ministry is user 1 (admin)
    with s.db() as c:
        c.execute("INSERT OR REPLACE INTO members_people(id,name,phone,email,active,version,created_at,account_user_id) VALUES('p-lead-1','Líder Um','(33) 9999-1111','admin@example.com',1,1,?,1)", (s.now(),))
        c.execute("INSERT OR REPLACE INTO ministries_assignments(id,person_id,ministry,position,is_leader,training_status,active,version,created_at) VALUES('a-lead-1','p-lead-1','Music','Líder de Louvor',1,'certified',1,1,?)", (s.now(),))

    # Admin schedules user 3 for worship
    sch = admin.post('/api/ministries/schedules', json={
        'title': 'Culto de Domingo Noite',
        'ministry': 'Music',
        'person_id': 'p-vol-3',
        'role_notes': 'Guitarra Base',
        'service_date': '2026-12-06',
        'service_time': '19:00',
        'status': 'pending'
    })
    assert sch.status_code == 200, sch.text
    sch_id = sch.json()['id']

    # Stranger (user 2) tries to respond -> 403 Forbidden
    resp_stranger = stranger.post(f'/api/ministries/schedules/{sch_id}/respond', json={
        'status': 'declined',
        'reason': 'Intruso'
    })
    assert resp_stranger.status_code == 403

    # Volunteer (user 3) marks 'declined' with reason
    resp_dec = volunteer.post(f'/api/ministries/schedules/{sch_id}/respond', json={
        'status': 'declined',
        'reason': 'Viagem a trabalho'
    })
    assert resp_dec.status_code == 200, resp_dec.text

    with s.db() as c:
        s_row = c.execute("SELECT status, role_notes FROM ministries_schedules WHERE id=?", (sch_id,)).fetchone()
        assert s_row['status'] == 'declined'
        assert '[Obs: Viagem a trabalho]' in s_row['role_notes']

        # Leader (user 1) received indisponibility notification
        notif = c.execute("SELECT * FROM notifications WHERE user_id=1 AND kind='ministry_schedule_update' ORDER BY id DESC LIMIT 1").fetchone()
        assert notif is not None
        assert 'Indisponibilidade' in notif['title']
        assert 'Voluntário Três' in notif['message']
        assert 'Viagem a trabalho' in notif['message']

    # Volunteer changes plans and confirms presence!
    resp_conf = volunteer.post(f'/api/ministries/schedules/{sch_id}/respond', json={
        'status': 'confirmed',
        'reason': ''
    })
    assert resp_conf.status_code == 200, resp_conf.text

    with s.db() as c:
        s_row = c.execute("SELECT status, role_notes FROM ministries_schedules WHERE id=?", (sch_id,)).fetchone()
        assert s_row['status'] == 'confirmed'
        assert '[Obs:' not in s_row['role_notes']
        assert 'Guitarra Base' in s_row['role_notes']

        # Leader (user 1) received confirmation notification
        notif2 = c.execute("SELECT * FROM notifications WHERE user_id=1 AND kind='ministry_schedule_update' ORDER BY id DESC LIMIT 1").fetchone()
        assert notif2 is not None
        assert 'Presença Confirmada' in notif2['title']
        assert 'Voluntário Três' in notif2['message']
