from test_app import records, client
from test_basic_sectors import grant
from backend import store as s
from backend.whatsapp_dispatch import normalize_br_phone


def test_phone_normalization():
    assert normalize_br_phone('(33) 99911-2233') == '5533999112233'
    assert normalize_br_phone('031 98888-7777') == '5531988887777'
    assert normalize_br_phone('+55 11 91234-5678') == '5511912345678'
    assert normalize_br_phone('') == ''


def test_whatsapp_permissions_and_scoped_leader_filtering(records, monkeypatch):
    admin = client(1)
    gc1 = admin.post('/api/members/cells', json={'name': 'GC Ide'}).json()['id']
    gc2 = admin.post('/api/members/cells', json={'name': 'GC Rocket'}).json()['id']

    p1 = admin.post('/api/members/people', json={
        'name': 'Carlos Eduardo',
        'phone': '(33) 99911-0001',
        'email': 'carlos@lagoinha.local',
        'cell_id': gc1,
    }).json()['id']
    p2 = admin.post('/api/members/people', json={
        'name': 'Fernanda Lima',
        'phone': '(33) 99911-0002',
        'email': 'fernanda@lagoinha.local',
        'cell_id': gc2,
    }).json()['id']

    admin.post('/api/ministries/assignments', json={'person_id': p1, 'ministry': 'Music', 'is_leader': True})
    admin.post('/api/ministries/assignments', json={'person_id': p2, 'ministry': 'Hero', 'is_leader': False})

    # Regular parent/viewer (user 3) cannot access WhatsApp dispatch
    regular = client(3)
    assert regular.get('/api/platform/whatsapp/recipients').status_code == 403
    assert regular.post('/api/platform/whatsapp/send', json={
        'target_sector': 'members',
        'message': 'Aviso teste',
    }).status_code == 403

    # Scoped ministry leader (user 2 -> ministries editor scoped to 'Music')
    grant(2, 'ministries', 'editor')
    with s.db() as c:
        c.execute("INSERT INTO module_scopes(user_id, module, scope) VALUES(2, 'ministries', 'Music')")

    leader = client(2)
    rec_res = leader.get('/api/platform/whatsapp/recipients?sector=ministries')
    assert rec_res.status_code == 200, rec_res.text
    rec_data = rec_res.json()
    names = [r['name'] for r in rec_data['recipients']]
    assert 'Carlos Eduardo' in names
    assert 'Fernanda Lima' not in names

    # Scoped leader cannot dispatch to 'all' or 'finance'
    assert leader.post('/api/platform/whatsapp/send', json={
        'target_sector': 'all',
        'message': 'Tentativa global',
    }).status_code == 403
    assert leader.put('/api/platform/whatsapp/config', json={
        'provider': 'evolution',
        'api_url': 'https://wa.lagoinha.local',
        'api_token': 'tok-123',
    }).status_code == 403


def test_pastor_and_admin_background_whatsapp_dispatch(records, monkeypatch):
    with s.db() as c:
        c.execute('INSERT INTO pastoral_users(user_id) VALUES(4)')
        c.execute("UPDATE users SET phone='33988776655' WHERE id=3")

    admin = client(1)
    pastor = client(4)

    gc_id = admin.post('/api/members/cells', json={'name': 'GC Ide'}).json()['id']
    p_res = admin.post('/api/members/people', json={
        'name': 'Gabriel Rocha',
        'phone': '33991234567',
        'cell_id': gc_id,
    })
    assert p_res.status_code == 200, p_res.text

    # Pastor configures Evolution API provider
    cfg_res = pastor.put('/api/platform/whatsapp/config', json={
        'provider': 'evolution',
        'api_url': 'https://evo.lagoinha.local',
        'instance_id': 'lagoinha-oficial',
        'api_token': 'secret-evo-key',
        'sender_name': 'Pr. Lagoinha',
        'enabled': True,
    })
    assert cfg_res.status_code == 200, cfg_res.text
    assert cfg_res.json()['configured'] is True

    sent_payloads = []

    class DummyResponse:
        status_code = 201
        text = '{"status":"PENDING"}'

    def fake_post(http, url, headers, payload):
        sent_payloads.append({'url': url, 'headers': headers, 'json': payload})
        return DummyResponse()

    import backend.whatsapp_dispatch as wd
    monkeypatch.setattr(wd, 'http_post', fake_post)

    # Pastor fetches recipients and sends personalized message to selected contacts
    recs = pastor.get('/api/platform/whatsapp/recipients?sector=all').json()
    target_keys = [r['key'] for r in recs['recipients'] if r['name'] in ('Gabriel Rocha', 'User 3')]
    assert len(target_keys) == 2

    send_res = pastor.post('/api/platform/whatsapp/send', json={
        'target_sector': 'all',
        'recipient_keys': target_keys,
        'message': 'Olá, {primeiro_nome}! Lembrete especial do {setor}.',
        'auto_greet': True,
        'also_notify_app': True,
    })
    assert send_res.status_code == 200, send_res.text
    out = send_res.json()
    assert out['configured'] is True
    assert out['sent_count'] == 2
    assert out['failed_count'] == 0
    assert out['app_notified'] >= 1
    assert len(sent_payloads) == 2
    assert any('Gabriel!' in p['json']['text'] for p in sent_payloads)
    assert all(p['headers']['apikey'] == 'secret-evo-key' for p in sent_payloads)
