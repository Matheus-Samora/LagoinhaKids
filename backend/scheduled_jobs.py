"""Authenticated, bounded notification work for scale-to-zero hosting."""
import os
from fastapi import APIRouter,HTTPException,Request
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token

router=APIRouter()

def verify_scheduler(token,audience):
    return id_token.verify_oauth2_token(token,GoogleRequest(),audience=audience)

@router.post('/api/internal/notification-cycle')
def notification_cycle(request:Request):
    account=os.getenv('KIDS_SCHEDULER_ACCOUNT','')
    audience=os.getenv('KIDS_SCHEDULER_AUDIENCE','')
    auth=request.headers.get('authorization','')
    if not account or not audience or not auth.startswith('Bearer '):
        raise HTTPException(403,detail='Execução não autorizada.')
    try:claims=verify_scheduler(auth[7:],audience)
    except Exception:raise HTTPException(403,detail='Execução não autorizada.') from None
    if claims.get('email')!=account or claims.get('email_verified') is not True:
        raise HTTPException(403,detail='Execução não autorizada.')
    from .push_worker import run_cycle
    result=run_cycle()
    if result.get('retry'):
        raise HTTPException(503,detail='Execução adiada; nova tentativa necessária.',headers={'Retry-After':'60'})
    return result
