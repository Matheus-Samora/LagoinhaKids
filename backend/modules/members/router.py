from fastapi import APIRouter,Depends
from ...module_security import module_access
router=APIRouter(prefix='/api/members',tags=['Lagoinha Members'])

@router.get('')
def module_status(user=Depends(module_access('members'))):
    return {'module':'members','name':'Lagoinha Members','status':'planned'}
