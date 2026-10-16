from fastapi import APIRouter,Depends
from ...module_security import module_access
router=APIRouter(prefix='/api/ministries',tags=['Lagoinha Ministries'])

@router.get('')
def module_status(user=Depends(module_access('ministries'))):
    return {'module':'ministries','name':'Lagoinha Ministries','status':'planned'}
