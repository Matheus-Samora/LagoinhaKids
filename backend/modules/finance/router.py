from fastapi import APIRouter,Depends
from ...module_security import module_access
router=APIRouter(prefix='/api/finance',tags=['Lagoinha Finance'])

@router.get('')
def module_status(user=Depends(module_access('finance'))):
    return {'module':'finance','name':'Lagoinha Finance','status':'planned'}
