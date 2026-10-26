import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse} from '../src/api-response.js';
test('API handles JSON, empty acknowledgements and backend conflict codes',async()=>{
 assert.deepEqual(await readApiResponse(new Response('{"ok":true}')), {ok:true});
 assert.equal(await readApiResponse(new Response(null,{status:204})),null);
 await assert.rejects(readApiResponse(new Response('{"detail":{"code":"conflict","message":"Reabra o perfil."}}',{status:409})),e=>e.status===409&&e.code==='conflict'&&e.message==='Reabra o perfil.');
});
test('API converts session and upstream HTML failures into actionable messages',async()=>{
 await assert.rejects(readApiResponse(new Response('',{status:401})),/sessão expirou/);
 await assert.rejects(readApiResponse(new Response('<html>upstream details</html>',{status:502}),{method:'POST'}),e=>e.status===502&&!e.message.includes('upstream')&&e.message.includes('Confira'));
 await assert.rejects(readApiResponse(new Response('<html>not JSON</html>',{status:200}),{method:'POST'}),/Confira se os dados foram salvos/);
});
test('API preserves plain FastAPI errors and form validation messages',async()=>{
 await assert.rejects(readApiResponse(new Response('{"detail":"Arquivo inválido"}',{status:400})),/Arquivo inválido/);
 await assert.rejects(readApiResponse(new Response('{"detail":[{"msg":"Data inválida"}]}',{status:422})),/Data inválida/);
});
