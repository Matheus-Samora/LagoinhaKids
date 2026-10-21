from test_app import records, client
from test_basic_sectors import person, account, grant
from backend import store as s
from uuid import uuid4


def test_personal_registration_approval_and_profile_ownership(records):
    admin = client(1)
    member = client(3)

    # Member submits own registration
    reg_res = member.post('/api/platform/my-registration', json={
        'name': 'Ana Souza',
        'family_name': 'Família Souza',
        'birthday': '1992-05-14',
        'phone': '33999112233',
        'address': 'Rua das Flores, 100',
        'profession': 'Arquiteta',
        'marital_status': 'Casado(a)'
    })
    assert reg_res.status_code == 200, reg_res.text
    rid = reg_res.json()['id']

    # Member sees pending registration in my-data
    my_data = member.get('/api/platform/my-data?module=members').json()
    assert my_data['personal_only'] is True
    assert len(my_data['registrations']) == 1
    assert my_data['registrations'][0]['id'] == rid
    assert my_data['registrations'][0]['address'] == 'Rua das Flores, 100'
    assert my_data['registrations'][0]['version'] == 1

    # Optimistic locking on updating pending registration
    stale = member.post('/api/platform/my-registration', json={
        'name': 'Ana Souza Editada',
        'address': 'Rua Nova, 200',
        'version': 99
    })
    assert stale.status_code == 409

    upd = member.post('/api/platform/my-registration', json={
        'name': 'Ana Souza Atualizada',
        'family_name': 'Família Souza',
        'birthday': '1992-05-14',
        'phone': '33999112233',
        'address': 'Rua Nova, 200',
        'profession': 'Arquiteta',
        'marital_status': 'Casado(a)',
        'version': 1
    })
    assert upd.status_code == 200

    # Admin approves registration -> created_by is transferred to member (user_id=3)
    app_res = admin.post(f'/api/members/self-registrations/{rid}/approve')
    assert app_res.status_code == 200, app_res.text
    pid = app_res.json()['person_id']

    # Member now sees approved profile in my-data and can update it
    my_after = member.get('/api/platform/my-data?module=members').json()
    assert len(my_after['profile']) == 1
    assert my_after['profile'][0]['id'] == pid
    assert my_after['profile'][0]['name'] == 'Ana Souza Atualizada'
    assert my_after['profile'][0]['address'] == 'Rua Nova, 200'

    prof_upd = member.put(f'/api/platform/my-profile/{pid}?version=1', json={
        'name': 'Ana Souza Final',
        'birthday': '1992-05-14',
        'phone': '33988776655',
        'address': 'Av. Brasil, 500',
        'profession': 'Urbanista',
        'marital_status': 'Casado(a)'
    })
    assert prof_upd.status_code == 200, prof_upd.text

    # Another user cannot edit Ana's profile
    other = client(4)
    assert other.put(f'/api/platform/my-profile/{pid}?version=2', json={
        'name': 'Invasão'
    }).status_code == 403


def test_viewer_personal_only_and_pastoral_notes_privacy(records):
    admin = client(1)
    # Admin creates a church member with pastoral notes
    p_admin = admin.post('/api/members/people', json={
        'name': 'Membro Geral',
        'pastoral_notes': 'Confidencial pastoral'
    })
    assert p_admin.status_code == 200

    # User 2 is a sector editor (not global admin or pastor)
    grant(2, 'members', 'editor')
    editor = client(2)
    listing_ed = editor.get('/api/members').json()
    assert listing_ed['pastoral_notes_allowed'] is False
    for p in listing_ed['people']:
        assert 'pastoral_notes' not in p

    # Editor cannot write pastoral_notes
    forbid_notes = editor.post('/api/members/people', json={
        'name': 'Novo Membro',
        'pastoral_notes': 'Tentativa de nota'
    })
    assert forbid_notes.status_code == 403

    # User 3 is a viewer (Visualizador — somente leitura)
    grant(3, 'members', 'viewer')
    viewer = client(3)
    listing_vw = viewer.get('/api/members').json()
    assert listing_vw['pastoral_notes_allowed'] is False
    for p in listing_vw['people']:
        assert 'pastoral_notes' not in p
    cant_create = viewer.post('/api/members/people', json={'name': 'Tentativa Viewer'})
    assert cant_create.status_code == 403


def test_reversible_archive_and_restore_with_referential_integrity(records):
    admin = client(1)
    aid = account(admin)
    entry_res = admin.post('/api/finance/entries', json={
        'account_id': aid,
        'direction': 'income',
        'description': 'Oferta Especial',
        'occurred_on': s.today(),
        'amount': '150.00'
    })
    assert entry_res.status_code == 200
    eid = entry_res.json()['id']

    # Cannot archive account while active entry exists
    blk = admin.post(f'/api/platform/records/finance/accounts/{aid}/archive', json={'version': 1})
    assert blk.status_code == 409

    # Archive entry first -> succeeds
    arch_entry = admin.post(f'/api/platform/records/finance/entries/{eid}/archive', json={'version': 1})
    assert arch_entry.status_code == 200

    # Now archive account -> succeeds
    arch_acc = admin.post(f'/api/platform/records/finance/accounts/{aid}/archive', json={'version': 1})
    assert arch_acc.status_code == 200

    # Verify both appear in /api/platform/archives/finance
    archives = admin.get('/api/platform/archives/finance').json()
    archived_ids = {item['id']: item for item in archives['items']}
    assert eid in archived_ids
    assert aid in archived_ids

    # Cannot restore entry while parent account is still archived
    blk_restore = admin.post(f'/api/platform/records/finance/entries/{eid}/restore', json={
        'version': archived_ids[eid]['version']
    })
    assert blk_restore.status_code == 409

    # Restore parent account first, then child entry
    res_acc = admin.post(f'/api/platform/records/finance/accounts/{aid}/restore', json={
        'version': archived_ids[aid]['version']
    })
    assert res_acc.status_code == 200

    res_entry = admin.post(f'/api/platform/records/finance/entries/{eid}/restore', json={
        'version': archived_ids[eid]['version']
    })
    assert res_entry.status_code == 200
