from datetime import datetime,timedelta
from uuid import uuid4
import pytest
from test_app import records,client
from backend import church_attendance as ca,store as s

BASE='/api/workspace/church-attendance'
NOW=datetime.fromisoformat('2026-10-27T19:00:00-03:00')

@pytest.fixture
def setup(records,monkeypatch):
    monkeypatch.setattr(ca,'clock',lambda:NOW)
    with s.db() as c:
        for uid in (3,4):c.execute('INSERT INTO members_people(id,name,account_user_id,created_at) VALUES(?,?,?,?)',('p'+str(uid),'Pessoa '+str(uid),uid,s.now()))
    return client(1)

def payload(**changes):
    return dict(request_id=str(uuid4()),title='Culto de teste isolado',starts_at=NOW.isoformat(),ends_at=(NOW+timedelta(hours=1)).isoformat(),location='Local fictício',latitude=-18.85,longitude=-41.95,radius_m=150,early_minutes=15,late_minutes=30,**changes)

def create(admin,**changes):
    body=payload();body.update(changes);r=admin.post(BASE,json=body);assert r.status_code==200,r.text
    return body

def position(**changes):
    body=dict(latitude=-18.85,longitude=-41.95,accuracy=10,captured_at=NOW.timestamp()*1000);body.update(changes);return body

def test_server_geofence_idempotency_and_private_coordinates(setup):
    row=create(setup);u=client(3);path=BASE+'/'+row['request_id']+'/check-in'
    assert u.post(path,json=position()).json()['already_present'] is False
    assert u.post(path,json=position()).json()['already_present'] is True
    with s.db() as c:
        records=c.execute('SELECT * FROM church_presences').fetchall();assert len(records)==1
        assert records[0]['person_id']=='p3' and records[0]['method']=='location'
        assert not {'latitude','longitude','accuracy','captured_at'}&set(records[0].keys())
    other=client(4).get(BASE).json();assert other['items'][0]['my_presence'] is None
    assert 'present_count' not in other['items'][0]
    assert u.get(BASE+'/'+row['request_id']+'/presences').status_code==403
    assert u.get(BASE+'/people/search?q=Pessoa').status_code==403

@pytest.mark.parametrize('changes',[{'latitude':-18.9},{'accuracy':120},{'accuracy':10,'latitude':-18.8487},{'captured_at':NOW.timestamp()*1000-61000},{'captured_at':NOW.timestamp()*1000+16000}])
def test_rejects_far_inaccurate_boundary_or_stale_gps(setup,changes):
    row=create(setup);r=client(3).post(BASE+'/'+row['request_id']+'/check-in',json=position(**changes))
    assert r.status_code in (400,409),r.text
    with s.db() as c:assert c.execute('SELECT count(*) FROM church_presences').fetchone()[0]==0

def test_server_time_window_timezone_and_closed_services(setup,monkeypatch):
    row=create(setup,starts_at=NOW.astimezone(__import__('datetime').timezone.utc).isoformat())
    path=BASE+'/'+row['request_id']+'/check-in';u=client(3)
    monkeypatch.setattr(ca,'clock',lambda:NOW-timedelta(minutes=16))
    assert u.post(path,json=position(captured_at=(NOW-timedelta(minutes=16)).timestamp()*1000)).status_code==409
    monkeypatch.setattr(ca,'clock',lambda:NOW+timedelta(minutes=31))
    assert u.post(path,json=position(captured_at=(NOW+timedelta(minutes=31)).timestamp()*1000)).status_code==409
    monkeypatch.setattr(ca,'clock',lambda:NOW)
    assert u.post(path,json=position()).status_code==200
    assert setup.delete(BASE+'/'+row['request_id']+'?version=1').status_code==200
    assert client(4).post(path,json=position()).status_code==409
    assert setup.get(BASE+'/'+row['request_id']+'/presences').json()['total']==1

def test_permissions_concurrency_and_cancel_ownership(setup):
    from test_basic_sectors import grant
    u=client(3);body=payload()
    assert u.post(BASE,json=body).status_code==403
    grant(2,'members','editor');editor=client(2)
    row=create(setup);path=BASE+'/'+row['request_id']
    assert editor.delete(path+'?version=1').status_code==403
    assert setup.put(path,json={**row,'version':1,'title':'Título atualizado'}).status_code==200
    assert setup.put(path,json={**row,'version':1}).status_code==409
    assert setup.delete(path+'?version=1').status_code==409
    assert setup.delete(path+'?version=2').status_code==200
    own=create(editor);assert editor.delete(BASE+'/'+own['request_id']+'?version=1').status_code==200

def test_manual_confirmation_audited_encrypted_and_removal_scoped(setup):
    from test_basic_sectors import grant
    grant(2,'members','editor');editor=client(2);row=create(setup);path=BASE+'/'+row['request_id']
    reason='GPS indisponível, conferido presencialmente.'
    assert client(3).post(path+'/manual',json={'person_id':'p4','reason':reason}).status_code==403
    assert editor.post(path+'/manual',json={'person_id':'p3','reason':reason}).status_code==200
    assert editor.post(path+'/manual',json={'person_id':'p3','reason':reason}).json()['already_present']
    with s.db() as c:
        r=c.execute('SELECT * FROM church_presences').fetchone()
        assert r['actor']==2 and r['method']=='manual' and reason not in r['reason']
    result=editor.get(path+'/presences').json();assert result['items'][0]['reason']==reason
    assert editor.delete(path+'/presences/p3').status_code==403
    assert client(4).delete(path+'/presences/p3').status_code==403
    assert client(3).delete(path+'/presences/p3').status_code==200
    assert setup.get(path+'/presences').json()['total']==0
    assert client(3).post(path+'/check-in',json=position()).status_code==200

def test_member_link_consent_and_csrf(setup):
    row=create(setup);u=client(2)
    assert u.post(BASE+'/'+row['request_id']+'/check-in',json=position()).status_code==409
    assert u.patch(BASE+'/preferences/automatic',json={'enabled':True}).status_code==409
    u=client(3);assert u.get(BASE).json()['auto_enabled'] is False
    assert u.patch(BASE+'/preferences/automatic',json={'enabled':True}).status_code==200
    assert u.get(BASE).json()['auto_enabled'] is True
    assert u.patch(BASE+'/preferences/automatic',json={'enabled':False}).status_code==200
    u.headers.pop('X-CSRF-Token')
    assert u.post(BASE+'/'+row['request_id']+'/check-in',json=position()).status_code==403

def test_creation_retry_and_bad_dates(setup):
    body=create(setup);assert setup.post(BASE,json=body).status_code==200
    assert setup.post(BASE,json={**body,'title':'Different'}).status_code==409
    bad=payload();bad['ends_at']=(NOW-timedelta(minutes=1)).isoformat()
    assert setup.post(BASE,json=bad).status_code==400
    assert setup.get(BASE+'?start=invalid').status_code==400
    assert setup.get(BASE+'?start=2026-01-01&end=2028-01-01').status_code==400
