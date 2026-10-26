from test_app import records,client
from backend import scheduled_jobs as jobs,push_worker

def test_scheduler_rejects_missing_invalid_or_wrong_identity(records,monkeypatch):
    monkeypatch.setenv('KIDS_SCHEDULER_ACCOUNT','scheduler@example.test')
    monkeypatch.setenv('KIDS_SCHEDULER_AUDIENCE','https://app.example.test')
    u=client(1)
    path='/api/internal/notification-cycle'
    assert u.post(path).status_code==403
    def invalid(*args):raise ValueError('private verifier detail')
    monkeypatch.setattr(jobs,'verify_scheduler',invalid)
    response=u.post(path,headers={'Authorization':'Bearer invalid'})
    assert response.status_code==403 and 'private' not in response.text
    monkeypatch.setattr(jobs,'verify_scheduler',lambda *args:{'email':'other@example.test','email_verified':True})
    assert u.post(path,headers={'Authorization':'Bearer wrong'}).status_code==403
    monkeypatch.setattr(jobs,'verify_scheduler',lambda *args:{'email':'scheduler@example.test','email_verified':False})
    assert u.post(path,headers={'Authorization':'Bearer unverified'}).status_code==403

def test_scheduler_runs_only_verified_audience_and_retries_failure(records,monkeypatch):
    monkeypatch.setenv('KIDS_SCHEDULER_ACCOUNT','scheduler@example.test')
    monkeypatch.setenv('KIDS_SCHEDULER_AUDIENCE','https://app.example.test')
    def verified(token,audience):
        assert token=='valid' and audience=='https://app.example.test'
        return {'email':'scheduler@example.test','email_verified':True}
    monkeypatch.setattr(jobs,'verify_scheduler',verified)
    monkeypatch.setattr(push_worker,'run_cycle',lambda:{'configured':True,'sent':0})
    u=client(1);path='/api/internal/notification-cycle';headers={'Authorization':'Bearer valid'}
    assert u.post(path,headers=headers).json()=={'configured':True,'sent':0}
    monkeypatch.setattr(push_worker,'run_cycle',lambda:{'retry':True})
    response=u.post(path,headers=headers)
    assert response.status_code==503 and response.headers['retry-after']=='60'
