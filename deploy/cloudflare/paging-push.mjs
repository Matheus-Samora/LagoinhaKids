// Android delivery is independent of a running WebView. No child data in push payloads.
let cachedAccess = null;
const base64url = value => Buffer.from(value).toString('base64url');
export function pagingPushReady(env) { return Boolean(env.FCM_SERVICE_ACCOUNT); }
async function accessToken(env, fetcher) {
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  if (account.project_id !== 'lagoinha-kids-20261014') throw Error('fcm_project_mismatch');
  if (cachedAccess?.email === account.client_email && cachedAccess.expires > Date.now() + 60000) return cachedAccess.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + base64url(JSON.stringify({
    iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const der = Buffer.from(account.private_key.replace(/-----[^-]+-----|\s/g, ''), 'base64');
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + base64url(new Uint8Array(signature)) }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('fcm_auth_' + response.status);
  const data = await response.json(); if (!data.access_token) throw Error('fcm_auth_invalid');
  cachedAccess = { email: account.client_email, token: data.access_token, expires: Date.now() + Math.min(3300, Number(data.expires_in || 3600)) * 1000 };
  return cachedAccess.token;
}

export async function enqueuePagingPush(db, pagingId, kind = 'call') {
  if (!['call', 'cancel'].includes(kind)) throw Error('invalid_paging_kind');
  // Registration needs authentication. A generic push may outlive cookie expiry,
  // but deleting its session anchor (logout/revocation) or disabling the user stops it.
  await db.run(`INSERT OR IGNORE INTO paging_push_deliveries(paging_id,user_id,token,kind,status,next_attempt)
    SELECT ?,d.user_id,d.token,?,'pending',0 FROM native_paging_devices d
    JOIN users u ON u.id=d.user_id AND u.active=1
    JOIN sessions ss ON ss.token=d.session_token AND ss.user_id=d.user_id
    WHERE d.user_id IN (SELECT parent_id FROM children WHERE id=(SELECT child_id FROM paging_requests WHERE id=?)
      UNION SELECT user_id FROM family_links WHERE child_id=(SELECT child_id FROM paging_requests WHERE id=?) AND active=1)`,
    [pagingId,kind,pagingId,pagingId]);
}

export function pagingMessage(row, now = Date.now()) {
  const created = Date.parse(row.created_at);
  const expires = Math.floor((created + 600000) / 1000);
  if (!Number.isFinite(created) || (row.kind === 'call' && (row.call_status !== 'active' || expires * 1000 <= now))) return null;
  return { message: { token: row.token, data: { type: row.kind === 'call' ? 'kids_paging' : 'kids_paging_cancel',
    paging_id: String(row.paging_id), user_id: String(row.user_id), expires_at: String(row.kind === 'call' ? expires : Math.floor(now/1000)+120) },
    android: { priority: 'HIGH', ttl: row.kind === 'call' ? Math.min(300,Math.max(1,expires-Math.floor(now/1000)))+'s' : '120s',
      restricted_package_name: 'com.lagoinha.kids', collapse_key: 'kids-'+row.paging_id+'-'+row.kind } } };
}

export async function deliverPagingPush(env, db, { fetcher = fetch, limit = 5 } = {}) {
  if (!pagingPushReady(env)) return { configured:false,accepted:0,failed:0 };
  const rows = await db.all(`SELECT o.*,p.created_at,p.status call_status FROM paging_push_deliveries o
    JOIN paging_requests p ON p.id=o.paging_id WHERE o.status='pending' AND o.next_attempt<=? ORDER BY o.next_attempt LIMIT ?`,[Math.floor(Date.now()/1000),limit]);
  let accepted=0,failed=0;
  for (const row of rows) {
    const now = Math.floor(Date.now()/1000);
    const claimed = await db.run("UPDATE paging_push_deliveries SET next_attempt=? WHERE paging_id=? AND token=? AND kind=? AND status='pending' AND next_attempt<=?",[now+90,row.paging_id,row.token,row.kind,now]);
    if (!claimed.rowcount) continue;
    const device = await db.first(`SELECT d.user_id FROM native_paging_devices d JOIN users u ON u.id=d.user_id AND u.active=1
      JOIN sessions ss ON ss.token=d.session_token AND ss.user_id=d.user_id WHERE d.token=? AND d.user_id=?`,[row.token,row.user_id]);
    const payload = pagingMessage(row);
    const stillFamily = await db.first(`SELECT 1 FROM children ch WHERE ch.id=(SELECT child_id FROM paging_requests WHERE id=?)
      AND (ch.parent_id=? OR EXISTS(SELECT 1 FROM family_links f WHERE f.child_id=ch.id AND f.user_id=? AND f.active=1))`,[row.paging_id,row.user_id,row.user_id]);
    if (!device || !payload || !stillFamily) {
      await db.run("UPDATE paging_push_deliveries SET status='suppressed',error_code='inactive_or_expired' WHERE paging_id=? AND token=? AND kind=?",[row.paging_id,row.token,row.kind]);continue;
    }
    try {
      const token = await accessToken(env,fetcher);
      const response = await fetcher('https://fcm.googleapis.com/v1/projects/lagoinha-kids-20261014/messages:send',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000) });
      if (!response.ok) {
        const error = await response.json().catch(()=>({}));
        const dead = (error.error?.details||[]).some(d=>d.errorCode==='UNREGISTERED');
        if(dead)await db.run('DELETE FROM native_paging_devices WHERE token=?',[row.token]);
        const attempts=Number(row.attempts||0)+1;
        await db.run('UPDATE paging_push_deliveries SET attempts=?,status=?,next_attempt=?,error_code=? WHERE paging_id=? AND token=? AND kind=?',
          [attempts,dead||attempts>=6?'failed':'pending',now+Math.min(300,15*2**attempts),'fcm_http_'+response.status,row.paging_id,row.token,row.kind]);failed++;continue;
      }
      await db.run("UPDATE paging_push_deliveries SET status='accepted',accepted_at=?,attempts=attempts+1,error_code='' WHERE paging_id=? AND token=? AND kind=?",[new Date().toISOString(),row.paging_id,row.token,row.kind]);accepted++;
    } catch {
      const attempts=Number(row.attempts||0)+1;
      await db.run('UPDATE paging_push_deliveries SET attempts=?,status=?,next_attempt=?,error_code=? WHERE paging_id=? AND token=? AND kind=?',
        [attempts,attempts>=6?'failed':'pending',now+Math.min(300,15*2**attempts),'provider_unavailable',row.paging_id,row.token,row.kind]);failed++;
    }
  }
  return { configured:true,accepted,failed };
}
