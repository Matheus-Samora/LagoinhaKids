import assert from 'node:assert/strict';
import {test} from 'node:test';

globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
document.querySelectorAll = () => [];
document.hidden = false;
const sources = [];
globalThis.EventSource = class extends EventTarget {
  constructor(url, options) { super(); this.url=url; this.options=options; sources.push(this); }
  close() { this.closed=true; }
};
const {RealtimeClient, realtime} = await import('../src/platform/realtime.js');

 test('stream uses a scoped ticket, preserves native bearer only in request header', async () => {
  let request;
  globalThis.fetch=async (url,options) => {request={url,options};return {ok:true,status:200,json:async()=>({ticket:'short-ticket'})};};
  const client=new RealtimeClient();
  try {
    await client.connect('csrf-secret','https://example.test','native-secret');
    assert.equal(request.url,'https://example.test/api/realtime/ticket');
    assert.equal(request.options.headers.Authorization,'Bearer native-secret');
    assert.equal(request.options.headers['X-CSRF-Token'],'csrf-secret');
    assert.equal(client.es.url,'https://example.test/api/realtime/stream?ticket=short-ticket');
    client.lastEventTime=0;
    const heartbeat=new Event('heartbeat');heartbeat.data='{}';
    client.es.dispatchEvent(heartbeat);
    assert.ok(client.lastEventTime>0);
    client.disconnect();
    window.dispatchEvent(new Event('online'));
    assert.equal(client.es,null);
  } finally {client.disconnect();realtime.disconnect();}
 });

 test('logout cancels a pending connection and stale ticket response', async () => {
  let resolve;
  globalThis.fetch=()=>new Promise(done=>{resolve=done;});
  const client=new RealtimeClient();
  const count=sources.length;
  const connecting=client.connect('csrf');
  client.disconnect();
  resolve({ok:true,status:200,json:async()=>({ticket:'stale'})});
  await connecting;
  assert.equal(client.es,null);
  assert.equal(sources.length,count);
 });

 test('unauthorized ticket response stops reconnecting', async () => {
  globalThis.fetch=async()=>({ok:false,status:401});
  const client=new RealtimeClient();
  await client.connect('expired');
  assert.equal(client.enabled,false);
  assert.equal(client.reconnectTimer,null);
  assert.equal(client.es,null);
 });
