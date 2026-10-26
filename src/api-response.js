// Keep transport failures distinct from confirmed application errors.
export async function readApiResponse(response,{method='GET',fallback='Não foi possível concluir a operação.'}={}){
 const raw=await response.text();let data;
 try{data=raw?JSON.parse(raw):null;}catch{data=null;}
 if(response.ok){
  if(response.status===204)return null;
  if(data!==null)return data;
  const error=new Error('O servidor retornou uma resposta inválida. '+(['GET','HEAD'].includes(method.toUpperCase())?'Atualize a tela e tente novamente.':'Confira se os dados foram salvos antes de repetir a operação.'));
  error.code='invalid_response';error.status=response.status;throw error;
 }
 const detail=data?.detail;
 const message=typeof detail==='string'?detail:detail?.message|| (Array.isArray(detail)?detail.map(x=>x.msg).filter(Boolean).join(' '):'');
 const defaults={401:'Sua sessão expirou. Entre novamente para continuar.',403:'Seu acesso não permite esta operação.',413:'O arquivo excede o tamanho permitido.',429:'Muitas tentativas. Aguarde um pouco antes de tentar novamente.',502:'O servidor está temporariamente indisponível. Confira o resultado antes de repetir a operação.',503:'O serviço está temporariamente indisponível. Tente novamente em instantes.',504:'A operação demorou mais que o esperado. Confira o resultado antes de tentar novamente.'};
 const error=new Error(message||defaults[response.status]||fallback);error.code=detail?.code;error.status=response.status;throw error;
}
