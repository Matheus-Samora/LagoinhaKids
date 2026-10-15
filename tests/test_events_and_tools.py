from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from test_app import records, client, PASSWORD
from backend import store as s

TZ = ZoneInfo('America/Sao_Paulo')

def test_events_crud_and_registration():
    admin_c = client(1)
    teacher_c = client(2)
    parent_c = client(3)
    parent2_c = client(4)

    # 1. Non-staff cannot create event
    res = parent_c.post('/api/events', json={
        'title': 'Acampamento Kids',
        'description': 'Final de semana incrível',
        'category': 'Acampamento',
        'target_audience': 'kids',
        'min_age': 5,
        'max_age': 11,
        'starts_at': (datetime.now(TZ) + timedelta(days=10)).isoformat(),
        'ends_at': (datetime.now(TZ) + timedelta(days=12)).isoformat(),
        'location': 'Sítio Recanto',
        'price': 'R$ 150',
        'max_capacity': 2
    })
    assert res.status_code == 403

    # 2. Staff creates event (Kids only)
    res = teacher_c.post('/api/events', json={
        'title': 'EBF de Férias',
        'description': 'Escola Bíblica de Férias da Lagoinha',
        'category': 'EBF',
        'target_audience': 'kids',
        'min_age': 3,
        'max_age': 11,
        'starts_at': (datetime.now(TZ) + timedelta(days=5)).isoformat(),
        'ends_at': (datetime.now(TZ) + timedelta(days=7)).isoformat(),
        'location': 'Templo Principal',
        'price': 'Gratuito',
        'max_capacity': 2
    })
    assert res.status_code == 200, res.text
    event_id = res.json()['id']

    # 3. Parents receive announcement notification
    notifs = parent_c.get('/api/notifications').json()
    assert any(n['kind'] == 'event_announcement' for n in notifs)

    # 4. List events (filter kids and teens)
    events_all = parent_c.get('/api/events').json()
    assert len(events_all) >= 1
    assert events_all[0]['title'] == 'EBF de Férias'
    assert events_all[0]['user_registered_children'] == []

    events_teens = parent_c.get('/api/events?audience=teens').json()
    # EBF is target_audience = 'kids', so shouldn't appear under pure 'teens' filter
    assert not any(e['id'] == event_id for e in events_teens)

    # 5. Register child 1 (born 2021, ~5 years old -> fits 3-11)
    res = parent_c.post(f'/api/events/{event_id}/register', json={'child_id': 1, 'notes': 'Alergia a lactose'})
    assert res.status_code == 200, res.text
    assert res.json()['status'] == 'confirmed'

    # Check that parent's registered children list updates
    events_updated = parent_c.get('/api/events').json()
    assert 1 in events_updated[0]['user_registered_children']

    # 6. Cannot register the same child twice
    res_dup = parent_c.post(f'/api/events/{event_id}/register', json={'child_id': 1})
    assert res_dup.status_code == 200
    assert res_dup.json()["id"] == res.json()["id"]
    assert res_dup.json()['status'] == 'confirmed'

    # 7. Parent 2 registers child 2 (born 2021 -> fills capacity = 2)
    res2 = parent2_c.post(f'/api/events/{event_id}/register', json={'child_id': 2})
    assert res2.status_code == 200

    # 8. Capacity full check for a 3rd child
    with s.db() as c:
        c.execute('INSERT INTO children(id,name,birthday,room_id,parent_id,created_at) VALUES(99,"Aluno Extra","2021-01-01",1,3,?)', (s.now(),))
    res_full = parent_c.post(f'/api/events/{event_id}/register', json={'child_id': 99})
    assert res_full.status_code == 400
    assert res_full.json()['detail']['code'] == 'capacity_full'

    # 9. Cancel registration
    cancel = parent_c.delete(f'/api/events/{event_id}/register/1')
    assert cancel.status_code == 200
    events_after_cancel = parent_c.get('/api/events').json()
    assert 1 not in events_after_cancel[0]['user_registered_children']

    # 10. Update event: staff can update, parents cannot
    update_data = {
        'title': 'EBF de Férias 2026 (Atualizado)',
        'description': 'Nova descrição atualizada para o evento.',
        'category': 'EBF',
        'target_audience': 'kids',
        'min_age': 3,
        'max_age': 11,
        'starts_at': (datetime.now(TZ) + timedelta(days=5)).isoformat(),
        'ends_at': (datetime.now(TZ) + timedelta(days=7)).isoformat(),
        'location': 'Auditório Kids',
        'price': 'Gratuito',
        'max_capacity': 50,
        'banner_url': 'https://example.com/banner.jpg'
    }
    assert parent_c.patch(f'/api/events/{event_id}', json=update_data).status_code == 403
    assert teacher_c.patch(f'/api/events/{event_id}', json=update_data).status_code == 200
    assert admin_c.patch(f'/api/events/{event_id}', json=update_data | {'title': 'EBF - Editado pela Admin'}).status_code == 200
    ev_check = admin_c.get('/api/events').json()
    assert ev_check[0]['title'] == 'EBF - Editado pela Admin'

    # 11. Delete event: staff can delete, parents cannot
    assert parent_c.delete(f'/api/events/{event_id}').status_code == 403
    assert admin_c.delete(f'/api/events/{event_id}').status_code == 200
    assert len(admin_c.get('/api/events').json()) == 0

def test_discipleship_curriculum():
    teacher_c = client(2)
    parent_c = client(3)

    # Create lesson
    d = (datetime.now(TZ) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
    lesson_res = teacher_c.post('/api/lessons', json={
        'room_id': 1,
        'title': 'Davi e Golias',
        'starts_at': d.isoformat(),
        'ends_at': (d + timedelta(hours=1)).isoformat()
    })
    assert lesson_res.status_code == 200
    lesson_id = lesson_res.json()['id']

    # Parent enrolls child in lesson
    reserve = parent_c.post(f'/api/lessons/{lesson_id}/presence', json={'child_id': 1})
    assert reserve.status_code == 200

    # Non-staff cannot post curriculum
    p_cur = parent_c.post(f'/api/lessons/{lesson_id}/curriculum', json={
        'theme': 'Coragem com Deus',
        'memory_verse': '1 Samuel 17:45',
        'family_question': 'Do que você tem medo que Deus pode te ajudar?'
    })
    assert p_cur.status_code == 403

    # Teacher posts curriculum
    t_cur = teacher_c.post(f'/api/lessons/{lesson_id}/curriculum', json={
        'theme': 'Coragem com Deus',
        'memory_verse': '1 Samuel 17:45',
        'family_question': 'Do que você tem medo que Deus pode te ajudar?'
    })
    assert t_cur.status_code == 200
    assert t_cur.json()['ok'] is True

    # Check curriculum get endpoint
    c_data = parent_c.get(f'/api/lessons/{lesson_id}/curriculum').json()
    assert c_data['theme'] == 'Coragem com Deus'
    assert c_data['memory_verse'] == '1 Samuel 17:45'
    assert 'Do que você tem medo' in c_data['family_question']

    # Parent received discipleship notification
    notifs = parent_c.get('/api/notifications').json()
    assert any(n['kind'] == 'discipleship' for n in notifs)

def test_paging_system_and_guest_checkin():
    teacher_c = client(2)
    parent_c = client(3)

    # Paging call
    res_page = teacher_c.post('/api/paging', json={
        'child_id': 1,
        'reason': 'Chorando com saudades dos pais'
    })
    assert res_page.status_code == 200
    page_data = res_page.json()
    assert page_data['status'] == 'active'
    assert page_data['child_name'] == 'Aluno fictício A'
    pid = page_data['id']

    # Check active paging
    active_list = parent_c.get('/api/paging/active').json()
    assert any(p['id'] == pid for p in active_list)

    # Parent received urgent notification
    notifs = parent_c.get('/api/notifications').json()
    assert any(n['kind'] == 'urgent_call' for n in notifs)

    # Parent clicks "Estou a caminho"
    ack_res = parent_c.post('/api/paging/on-my-way', json={'paging_id': pid, 'child_id': 1})
    assert ack_res.status_code == 200
    assert ack_res.json()['status'] == 'on_my_way'

    # Active paging now reflects on_my_way status
    active_mid = parent_c.get('/api/paging/active').json()
    p_item = next(p for p in active_mid if p['id'] == pid)
    assert p_item['status'] == 'on_my_way'

    # Staff received arriving notification
    t_notifs = teacher_c.get('/api/notifications').json()
    assert any(n['kind'] == 'arriving' for n in t_notifs)

    # Teacher resolves paging
    res_resolve = teacher_c.post(f'/api/paging/{pid}/resolve')
    assert res_resolve.status_code == 200
    assert res_resolve.json()['ok'] is True

    # Now active paging list is empty of this id
    active_after = parent_c.get('/api/paging/active').json()
    assert not any(p['id'] == pid for p in active_after)

    # Calling on-my-way for an already resolved paging succeeds gracefully
    ack_res_resolved = parent_c.post('/api/paging/on-my-way', json={'paging_id': pid})
    assert ack_res_resolved.status_code == 200
    assert ack_res_resolved.json()['status'] == 'resolved'

    # Calling on-my-way with no active paging (e.g. test notification) notifies admin and succeeds gracefully
    admin_c = client(1)
    ack_res_demo = parent_c.post('/api/paging/on-my-way', json={})
    assert ack_res_demo.status_code == 404
    admin_notifs = admin_c.get('/api/notifications').json()
    assert any(n['kind'] == 'arriving' for n in admin_notifs)

    # Guest fast-track check-in
    guest_res = teacher_c.post('/api/guests/checkin', json={
        'child_name': 'Criança Visitante',
        'child_age': 4,
        'guardian_name': 'Mãe Visitante',
        'guardian_phone': '31988887777',
        'allergies': 'Nenhuma',
        'room_id': 1
    })
    assert guest_res.status_code == 200
    g_data = guest_res.json()
    assert g_data['child_name'] == 'Criança Visitante'
    assert g_data['claim_code'].startswith('VIS-')

    # List active guests
    active_guests = teacher_c.get('/api/guests/active').json()
    assert any(g['child_name'] == 'Criança Visitante' for g in active_guests)
