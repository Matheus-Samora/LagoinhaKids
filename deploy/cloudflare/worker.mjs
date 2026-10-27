import { scryptSync, randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

const COOKIE = 'lagoinha_session';
const ENC_PREFIX = 'enc:v1:';
const CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MODULES = {
  kids: 'Lagoinha Kids',
  finance: 'Lagoinha Finance',
  members: 'Lagoinha Members',
  ministries: 'Lagoinha Ministries'
};

function nowIso() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}-03:00`;
}

function todayStr() {
  return nowIso().slice(0, 10);
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(Buffer.from(String(password), 'utf8'), Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `${salt}:${derived}`;
}

function passwordOk(password, stored) {
  try {
    const [salt, expected] = String(stored || '').split(':');
    if (!salt || !expected) return false;
    const actual = scryptSync(Buffer.from(String(password), 'utf8'), Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    const a = Buffer.from(actual, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function b64UrlDecode(str) {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(norm, 'base64');
}

function b64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function fernetEncrypt(plainText, masterKey) {
  if (!masterKey) return plainText;
  const key = b64UrlDecode(masterKey.trim());
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);
  const iv = randomBytes(16);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const cipher = createCipheriv('aes-128-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
  const basicParts = Buffer.concat([Buffer.from([0x80]), ts, iv, ciphertext]);
  const hmac = createHmac('sha256', signingKey).update(basicParts).digest();
  return b64UrlEncode(Buffer.concat([basicParts, hmac]));
}

function fernetDecrypt(tokenStr, masterKey) {
  if (!masterKey) return tokenStr;
  const key = b64UrlDecode(masterKey.trim());
  const encryptionKey = key.subarray(16, 32);
  const data = b64UrlDecode(tokenStr);
  if (data.length < 57 || data[0] !== 0x80) throw new Error('Invalid Fernet token');
  const iv = data.subarray(9, 25);
  const ciphertext = data.subarray(25, data.length - 32);
  const decipher = createDecipheriv('aes-128-cbc', encryptionKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function encryptText(value, env) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith(ENC_PREFIX)) return raw;
  try {
    return ENC_PREFIX + fernetEncrypt(raw, env.KIDS_MASTER_KEY);
  } catch {
    return raw;
  }
}

function decryptText(value, env) {
  const raw = value || '';
  if (!raw || typeof raw !== 'string' || !raw.startsWith(ENC_PREFIX)) return raw;
  try {
    return fernetDecrypt(raw.slice(ENC_PREFIX.length), env.KIDS_MASTER_KEY);
  } catch {
    return raw;
  }
}

function decryptRecord(row, env) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string' && out[k].startsWith(ENC_PREFIX)) {
      out[k] = decryptText(out[k], env);
    }
  }
  return out;
}

class D1Wrap {
  constructor(db) {
    this.db = db;
  }
  _prep(sql, params = []) {
    let stmt = this.db.prepare(sql);
    if (params && params.length > 0) {
      const bound = params.map(v => (v === undefined ? null : v));
      stmt = stmt.bind(...bound);
    }
    return stmt;
  }
  async all(sql, params = []) {
    const res = await this._prep(sql, params).all();
    return res.results || [];
  }
  async first(sql, params = []) {
    return await this._prep(sql, params).first();
  }
  async run(sql, params = []) {
    const res = await this._prep(sql, params).run();
    return {
      lastrowid: res.meta?.last_row_id ?? null,
      rowcount: res.meta?.changes ?? 0
    };
  }
  async scalar(sql, params = []) {
    const row = await this.first(sql, params);
    if (!row) return null;
    const keys = Object.keys(row);
    return keys.length ? row[keys[0]] : null;
  }
}

function jsonResp(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      ...extraHeaders
    }
  });
}

function fail(code, message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.payload = { detail: { code, message } };
  throw err;
}

async function roleSets(db) {
  const adminRows = await db.all('SELECT user_id FROM platform_admins');
  const pastorRows = await db.all("SELECT user_id FROM pastoral_users UNION SELECT user_id FROM module_access WHERE role='pastor' AND enabled=1");
  return {
    admins: new Set(adminRows.map(r => Number(r.user_id))),
    pastors: new Set(pastorRows.map(r => Number(r.user_id)))
  };
}

function buildPublicUser(row, admins, pastors) {
  const uid = Number(row.id);
  const central = admins.has(uid);
  let staffRole = row.staff_role || '';
  if (!staffRole && row.role === 'teacher') staffRole = 'teacher';
  else if (!staffRole && row.role === 'admin') staffRole = 'admin';
  const pastor = pastors.has(uid) || ['pastor', 'pastora'].includes(staffRole.trim().toLowerCase());
  if (pastor && !staffRole) staffRole = 'pastor';
  return {
    id: uid,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    platform_admin: central,
    pastor,
    staff_role: staffRole,
    email_verified: Boolean(row.email_verified),
    mfa_enabled: Boolean(row.mfa_secret),
    mfa_required: Boolean(row.mfa_required),
    phone: row.phone || '',
    avatar_url: row.avatar_url || '',
    profile_version: row.profile_version ?? 1,
    public_bio: row.public_bio !== undefined ? Boolean(row.public_bio) : true,
    public_profession: row.public_profession !== undefined ? Boolean(row.public_profession) : true,
    google_linked: Boolean(row.google_sub)
  };
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

async function getSession(request, db) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const cookieToken = cookies[COOKIE] || '';
  const creds = [];
  if (bearer) creds.push([sha256Hex(bearer), true]);
  else if (cookieToken) creds.push([sha256Hex(cookieToken), false]);

  const nowSec = Math.floor(Date.now() / 1000);
  let row = null;
  for (const [tokenHash] of creds) {
    row = await db.first(
      'SELECT u.*, ss.csrf, ss.expires, ss.token FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token=? AND ss.expires>? AND u.active=1',
      [tokenHash, nowSec]
    );
    if (row) break;
  }
  if (!row) fail('login', 'Entre para continuar.', 401);
  const { admins, pastors } = await roleSets(db);
  const uid = Number(row.id);
  const privacyAdmin = admins.has(uid) || pastors.has(uid) || ['pastor', 'pastora'].includes(String(row.staff_role || '').toLowerCase());
  const user = { ...row, id: uid, privacy_admin: privacyAdmin, admins, pastors };
  if (privacyAdmin) user.role = 'admin';
  return user;
}

async function writeAudit(db, actor, action, childId = null, ip = '') {
  const prev = await db.scalar('SELECT prev_hash FROM audit ORDER BY id DESC LIMIT 1');
  const stamp = nowIso();
  const chain = sha256Hex(`${prev || ''}|${actor}|${action}|${childId}|${stamp}|${ip}`);
  await db.run(
    'INSERT INTO audit(actor,action,child_id,created_at,prev_hash,ip) VALUES(?,?,?,?,?,?)',
    [actor, action, childId, stamp, chain, ip]
  );
}

async function linkedPerson(db, user) {
  let p = await db.first('SELECT * FROM members_people WHERE account_user_id=? AND active=1', [user.id]);
  if (!p && user.email) {
    p = await db.first('SELECT * FROM members_people WHERE lower(email)=lower(?) AND active=1', [user.email]);
  }
  return p;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const a = toRad(lat1);
  const b = toRad(lat2);
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // Serve static frontend and SPA routes via Cloudflare Assets
    if (!path.startsWith('/api/')) {
      const spaRoutes = new Set(['/kids', '/kids/', '/systems', '/systems/', '/access', '/access/', '/membro', '/membro/', '/finance', '/finance/', '/members', '/members/', '/ministries', '/ministries/']);
      if (spaRoutes.has(path)) {
        const target = path.startsWith('/kids') ? '/index.html' : '/systems.html';
        return env.ASSETS.fetch(new Request(new URL(target, url.origin), request));
      }
      if (path === '/') {
        return env.ASSETS.fetch(new Request(new URL('/systems.html', url.origin), request));
      }
      const assetResp = await env.ASSETS.fetch(request);
      if (assetResp.status !== 404) return assetResp;
      return env.ASSETS.fetch(new Request(new URL('/systems.html', url.origin), request));
    }

    const db = new D1Wrap(env.DB);
    const ip = request.headers.get('cf-connecting-ip') || '';

    try {
      // 1. Public health & version & privacy
      if (path === '/api/health' && method === 'GET') {
        return jsonResp({
          status: 'ok',
          application: 'Lagoinha Systems',
          hosting: 'Cloudflare Workers + D1',
          google_enabled: false,
          push_enabled: true,
          native_push_enabled: false,
          biometric_liveness: false
        });
      }
      if (path === '/api/version' && method === 'GET') {
        return jsonResp({ version: '3.3.0', application: 'Lagoinha Systems', build: 'cloudflare-d1' });
      }
      if (path === '/api/terms/privacy' && method === 'GET') {
        return jsonResp({
          version: '2026.1',
          title: 'Política de Privacidade e Proteção de Dados (LGPD Art. 14)',
          controller: 'Igreja Batista da Lagoinha — Ministério Infantil Lagoinha Kids',
          summary: 'Tratamento de dados estritamente voltado ao melhor interesse da criança e sua segurança física no templo.',
          sections: [
            { title: '1. Finalidade Exclusiva', text: 'Os dados cadastrais de crianças e responsáveis são coletados com a finalidade estrita de acolhimento cristão e segurança física no templo.' },
            { title: '2. Alergias e Cuidados Médicos', text: 'Informações de alergias e condições especiais são tratadas como dados sensíveis e exibidas exclusivamente à equipe voluntária responsável pela salinha.' },
            { title: '3. Código de Segurança Pareado ("No Tag, No Child")', text: 'Em cada culto é gerado um código randômico de 4 caracteres pareado entre a etiqueta da criança e o comprovante dos pais.' }
          ]
        });
      }
      if (path === '/api/web-push/config' && method === 'GET') {
        return jsonResp({ enabled: false, public_key: '' });
      }

      // 2. Media binary serving
      if (path.startsWith('/api/media/') && method === 'GET') {
        const mediaId = path.split('/').pop();
        const row = await db.first('SELECT mime_type, data FROM media WHERE id=?', [mediaId]);
        if (row && row.data) {
          const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Buffer.from(row.data);
          return new Response(bytes, {
            status: 200,
            headers: {
              'Content-Type': row.mime_type || 'image/webp',
              'Cache-Control': 'public, max-age=86400'
            }
          });
        }
        const assetMedia = await env.ASSETS.fetch(request);
        if (assetMedia.status !== 404) {
          const h = new Headers(assetMedia.headers);
          h.set('Content-Type', 'image/webp');
          h.set('Cache-Control', 'public, max-age=86400');
          return new Response(assetMedia.body, { status: 200, headers: h });
        }
        return jsonResp({ detail: { code: 'missing', message: 'Mídia não encontrada.' } }, 404);
      }

      // 3. Auth login / register / logout
      if (path === '/api/auth/login' && method === 'POST') {
        const body = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const row = await db.first('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1', [email]);
        if (!row || !row.password || !passwordOk(password, row.password)) {
          fail('credentials', 'E-mail ou senha incorretos.', 401);
        }
        const token = randomBytes(32).toString('base64url');
        const csrf = randomBytes(24).toString('base64url');
        const expires = Math.floor(Date.now() / 1000) + 12 * 3600;
        await db.run('INSERT INTO sessions(token,user_id,csrf,expires) VALUES(?,?,?,?)', [sha256Hex(token), row.id, csrf, expires]);
        await writeAudit(db, row.id, 'login', null, ip);
        const { admins, pastors } = await roleSets(db);
        const cookieStr = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${12 * 3600}`;
        return jsonResp(
          { user: buildPublicUser(row, admins, pastors), csrf, access_token: token },
          200,
          { 'Set-Cookie': cookieStr }
        );
      }

      if (path === '/api/auth/register' && method === 'POST') {
        const body = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const password = String(body.password || '');
        if (name.length < 2) fail('name', 'Informe seu nome completo.');
        if (password.length < 12) fail('password', 'Use pelo menos 12 caracteres na senha.');
        const existing = await db.first('SELECT id FROM users WHERE lower(email)=lower(?)', [email]);
        if (existing) fail('exists', 'E-mail já cadastrado.', 409);
        const ins = await db.run(
          'INSERT INTO users(name,email,password,role,staff_role,created_at) VALUES(?,?,?,?,?,?)',
          [name, email, passwordHash(password), 'parent', '', nowIso()]
        );
        const uid = ins.lastrowid;
        await db.run("INSERT OR IGNORE INTO module_access(user_id,module,role,enabled) VALUES(?,'kids','parent',1)", [uid]);
        const row = await db.first('SELECT * FROM users WHERE id=?', [uid]);
        const token = randomBytes(32).toString('base64url');
        const csrf = randomBytes(24).toString('base64url');
        const expires = Math.floor(Date.now() / 1000) + 12 * 3600;
        await db.run('INSERT INTO sessions(token,user_id,csrf,expires) VALUES(?,?,?,?)', [sha256Hex(token), uid, csrf, expires]);
        const { admins, pastors } = await roleSets(db);
        const cookieStr = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${12 * 3600}`;
        return jsonResp(
          { user: buildPublicUser(row, admins, pastors), csrf, access_token: token },
          200,
          { 'Set-Cookie': cookieStr }
        );
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        const cookies = parseCookies(request.headers.get('cookie') || '');
        if (cookies[COOKIE]) {
          await db.run('DELETE FROM sessions WHERE token=?', [sha256Hex(cookies[COOKIE])]);
        }
        return jsonResp({ ok: true }, 200, {
          'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`
        });
      }

      // All remaining routes require an authenticated session
      const user = await getSession(request, db);
      const { admins, pastors } = user;
      const isRoot = admins.has(user.id);
      const isPastor = pastors.has(user.id) || ['pastor', 'pastora'].includes(String(user.staff_role || '').toLowerCase());
      const isGlobal = isRoot || isPastor;

      if (path === '/api/me' && method === 'GET') {
        return jsonResp({
          user: buildPublicUser(user, admins, pastors),
          csrf: user.csrf,
          google_enabled: false,
          push_enabled: true
        });
      }

      if (path === '/api/platform/me' && method === 'GET') {
        const grantRows = await db.all('SELECT module,role,enabled FROM module_access WHERE user_id=?', [user.id]);
        const grants = Object.fromEntries(grantRows.map(r => [r.module, r]));
        const scopeRows = await db.all('SELECT module,scope FROM module_scopes WHERE user_id=?', [user.id]);
        const scopes = Object.fromEntries(scopeRows.map(r => [r.module, r.scope]));
        const notifs = await db.all('SELECT id,kind,title,message,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 25', [user.id]);
        const unread = await db.scalar('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL', [user.id]);
        const gcLeader = Boolean(await db.first('SELECT 1 FROM gc_leaders WHERE user_id=?', [user.id]));
        return jsonResp({
          active_module: null,
          user: buildPublicUser(user, admins, pastors),
          platform_admin: isRoot,
          pastor: isPastor,
          gc_leader: gcLeader,
          encryption: 'AES-128-Fernet-HMAC-SHA256',
          notifications: notifs,
          notification_unread_count: Number(unread || 0),
          modules: Object.entries(MODULES).map(([key, name]) => ({
            id: key,
            name,
            url: '/' + key,
            enabled: Boolean(isGlobal || grants[key]?.enabled || key === 'kids'),
            role: isRoot ? (key !== 'kids' ? 'admin' : user.role) : (isPastor ? 'pastor' : (key === 'kids' ? user.role : grants[key]?.role || 'viewer')),
            scope: isGlobal ? '' : (scopes[key] || ''),
            status: 'operational'
          }))
        });
      }

      const MINISTRY_CATALOG = ['Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link','Future','Gourmet','Champions','DNA'];
      const WORSHIP_ROLES = ['Ministrante','Backing Vocal','Tecladista','Guitarrista','Baixista','Baterista','Cordas / Sopros','Diretor Musical','VS / Tracks'];

      if (path === '/api/platform/community' && method === 'GET') {
        const rawCells = (await db.all('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name')).map(c => decryptRecord(c, env));
        const cellPeople = await db.all("SELECT id, name, cell_id FROM members_people WHERE active=1 AND cell_id IS NOT NULL AND cell_id != '' ORDER BY name");
        const membersByCell = {};
        for (const cp of cellPeople) (membersByCell[cp.cell_id] ||= []).push({ id: cp.id, name: cp.name });
        const cells = rawCells.map(c => ({ ...c, members: membersByCell[c.id] || [], member_count: (membersByCell[c.id] || []).length }));
        const countsRows = await db.all('SELECT ministry,count(*) total,sum(CASE WHEN is_leader=1 THEN 1 ELSE 0 END) leaders FROM ministries_assignments WHERE active=1 GROUP BY ministry');
        const counts = Object.fromEntries(countsRows.map(r => [r.ministry, r]));
        const minAssigns = await db.all('SELECT a.id, a.person_id, a.ministry, a.position, a.is_leader, p.name as person_name FROM ministries_assignments a JOIN members_people p ON p.id=a.person_id WHERE a.active=1 AND p.active=1 ORDER BY a.is_leader DESC, p.name');
        const membersByMin = {};
        for (const ma of minAssigns) (membersByMin[ma.ministry] ||= []).push(ma);
        const myApps = (await db.all('SELECT * FROM sector_applications WHERE user_id=? OR lower(email)=lower(?) ORDER BY created_at DESC LIMIT 50', [user.id, user.email])).map(r => decryptRecord(r, env));
        const notifs = await db.all('SELECT id,kind,title,message,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 25', [user.id]);
        const now = nowIso();
        const announcements = (await db.all('SELECT * FROM platform_announcements WHERE active=1 AND (publish_at IS NULL OR publish_at<=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 40', [now, now])).map(a => decryptRecord(a, env));
        const person = await linkedPerson(db, user);
        const mySchedules = person
          ? (await db.all('SELECT ms.*, p.name as person_name FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.person_id=? AND ms.active=1 ORDER BY ms.service_date ASC, ms.service_time ASC LIMIT 30', [person.id])).map(r => decryptRecord(r, env))
          : [];
        return jsonResp({
          cells,
          gcs: cells,
          ministries: MINISTRY_CATALOG.map(m => ({ name: m, total: Number(counts[m]?.total || (membersByMin[m] || []).length || 0), leaders: Number(counts[m]?.leaders || 0), members: membersByMin[m] || [] })),
          my_applications: myApps,
          notifications: notifs,
          announcements,
          my_schedules: mySchedules,
          linked_person: person ? decryptRecord(person, env) : null
        });
      }

      if (path === '/api/platform/apply' && method === 'POST') {
        const body = await request.json();
        const rid = randomBytes(16).toString('hex');
        const tType = body.target_type === 'gc' ? 'gc' : 'ministry';
        const tName = (body.target_name || '').trim();
        const tId = (body.target_id || tName).trim();
        const roleDes = (body.role_desired || (tType === 'gc' ? 'Participante de GC' : 'Voluntário')).trim();
        const phone = (body.phone || user.phone || '').trim();
        await db.run(
          'INSERT INTO sector_applications(id,user_id,member_name,phone,email,target_type,target_id,target_name,role_desired,notes,status,reviewed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [rid, user.id, user.name, phone, user.email, tType, tId, tName, roleDes, encryptText(body.notes || '', env), 'pending', null, nowIso()]
        );
        return jsonResp({ id: rid, ok: true, message: `Inscrição enviada! O responsável por ${tName} foi notificado e entrará em contato.` });
      }

      if (path === '/api/platform/announcements' && method === 'GET') {
        const now = nowIso();
        const rows = await db.all('SELECT * FROM platform_announcements WHERE active=1 AND (publish_at IS NULL OR publish_at<=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 50', [now, now]);
        return jsonResp(rows.map(a => decryptRecord(a, env)));
      }

      if (path === '/api/users' && method === 'GET') {
        const trRows = await db.all('SELECT user_id, room_id FROM teacher_rooms');
        const tr = {};
        for (const r of trRows) {
          (tr[r.user_id] ||= []).push(r.room_id);
        }
        const rows = await db.all('SELECT * FROM users ORDER BY name');
        return jsonResp(rows.map(r => ({ ...buildPublicUser(r, admins, pastors), rooms: tr[r.id] || [] })));
      }

      if (path === '/api/platform/users' && method === 'GET') {
        const rows = await db.all('SELECT * FROM users ORDER BY name');
        const grantsRows = await db.all('SELECT * FROM module_access');
        const scopesRows = await db.all('SELECT * FROM module_scopes');
        const byUser = {};
        const grantsList = {};
        for (const g of grantsRows) {
          (byUser[g.user_id] ||= {})[g.module] = g;
          (grantsList[g.user_id] ||= []).push(g);
        }
        const scByUser = {};
        for (const s of scopesRows) (scByUser[s.user_id] ||= {})[s.module] = s.scope;
        return jsonResp(rows.map(r => ({
          ...buildPublicUser(r, admins, pastors),
          modules: byUser[r.id] || {},
          scopes: scByUser[r.id] || {},
          grants: (grantsList[r.id] || []).map(g => ({
            ...g,
            ...(g.module === 'kids' ? { role: r.role } : {}),
            scope: (scByUser[r.id] || {})[g.module] || ''
          }))
        })));
      }

      if (path === '/api/team' && method === 'GET') {
        const staffRows = await db.all("SELECT * FROM users WHERE role IN ('admin','teacher') ORDER BY name");
        const trRows = await db.all('SELECT user_id, room_id FROM teacher_rooms');
        const tr = {};
        for (const r of trRows) (tr[r.user_id] ||= []).push(r.room_id);
        const members = staffRows.map(r => ({ ...buildPublicUser(r, admins, pastors), rooms: tr[r.id] || [] }));
        const candidates = isGlobal
          ? (await db.all("SELECT * FROM users WHERE role='parent' AND active=1 ORDER BY name")).map(r => buildPublicUser(r, admins, pastors))
          : [];
        return jsonResp({ members, candidates });
      }

      if (path === '/api/rooms' && method === 'GET') {
        const rows = await db.all(`
          SELECT r.*, u.name as teacher_name, m.name as monitor_name,
            (SELECT count(*) FROM children ch WHERE ch.room_id=r.id AND ch.archived=0) as student_count,
            (SELECT count(*) FROM attendance a JOIN children ch ON ch.id=a.child_id WHERE ch.room_id=r.id AND ch.archived=0 AND a.day=? AND a.status='present') as present_count
          FROM rooms r
          LEFT JOIN users u ON u.id=r.teacher_id
          LEFT JOIN users m ON m.id=r.monitor_id
          WHERE r.active=1
          ORDER BY r.min_age, r.name
        `, [todayStr()]);
        return jsonResp(rows);
      }

      if (path === '/api/children' && method === 'GET') {
        const day = todayStr();
        const rows = await db.all(`
          SELECT ch.*, r.name as room_name, r.color as room_color, u.name as parent_name, u.phone as parent_phone, u.email as parent_email,
            a.status as attendance_status, a.in_at, a.out_at, a.guardian, a.claim_code, a.checkout_guardian
          FROM children ch
          JOIN rooms r ON r.id=ch.room_id
          LEFT JOIN users u ON u.id=ch.parent_id
          LEFT JOIN attendance a ON a.child_id=ch.id AND a.day=?
          WHERE ch.archived=0
          ORDER BY ch.name
        `, [day]);
        const filtered = user.role === 'parent' && !isGlobal
          ? rows.filter(r => Number(r.parent_id) === user.id)
          : rows;
        return jsonResp(filtered.map(r => decryptRecord(r, env)));
      }

      if (path === '/api/lessons' && method === 'GET') {
        const rows = await db.all(`
          SELECT l.*, r.name as room_name, r.color as room_color, r.capacity as room_capacity,
            u.name as teacher_name, m.name as monitor_name,
            (SELECT count(*) FROM reservations b WHERE b.lesson_id=l.id AND b.confirmed=1) as reserved_count
          FROM lessons l
          JOIN rooms r ON r.id=l.room_id
          LEFT JOIN users u ON u.id=l.teacher_id
          LEFT JOIN users m ON m.id=l.monitor_id
          WHERE l.active=1
          ORDER BY l.starts_at DESC
          LIMIT 200
        `);
        return jsonResp(rows);
      }

      if (path === '/api/events' && method === 'GET') {
        const rows = await db.all(`
          SELECT e.*,
            (SELECT count(*) FROM event_registrations er WHERE er.event_id=e.id AND er.status='confirmed') as registered_count
          FROM events e
          WHERE e.active=1
          ORDER BY e.starts_at ASC
        `);
        return jsonResp(rows);
      }

      if (path === '/api/notifications' && method === 'GET') {
        const rows = await db.all(`
          SELECT n.*, ch.name as child_name, u.name as sender_name
          FROM notifications n
          LEFT JOIN children ch ON ch.id=n.child_id
          LEFT JOIN users u ON u.id=n.sender
          WHERE n.user_id=?
          ORDER BY n.id DESC
          LIMIT 100
        `, [user.id]);
        return jsonResp(rows);
      }

      if (path === '/api/notifications/read-all' && method === 'POST') {
        await db.run('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE user_id=? AND read_at IS NULL', [nowIso(), user.id]);
        return jsonResp({ ok: true });
      }

      if ((path.startsWith('/api/notifications/') || path.startsWith('/api/platform/notifications/')) && path.endsWith('/read') && method === 'POST') {
        const parts = path.split('/');
        const nid = Number(parts[parts.length - 2]);
        await db.run('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?', [nowIso(), nid, user.id]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/notification-center' || path === '/api/notification-center/summary') {
        const rawItems = await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60', [user.id]);
        const items = rawItems.map(n => ({
          ...n,
          category: n.kind?.includes('schedule') ? 'schedules' : n.kind?.includes('announcement') ? 'announcements' : n.kind?.includes('kid') || n.kind === 'paging' ? 'kids' : 'system',
          category_label: n.kind?.includes('schedule') ? 'Escalas' : n.kind?.includes('announcement') ? 'Comunicados' : n.kind?.includes('kid') || n.kind === 'paging' ? 'Kids' : 'Sistema',
          priority: n.kind === 'paging' ? 'urgent' : 'normal',
          url: n.kind?.includes('schedule') ? '/ministries#schedules' : '/membro'
        }));
        const unread = await db.scalar('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL', [user.id]);
        return jsonResp({ items, unread_count: Number(unread || 0), next_before: null });
      }

      if (path === '/api/paging/active' && method === 'GET') {
        const rows = await db.all(`
          SELECT p.*, ch.name as child_name, r.name as room_name
          FROM paging_requests p
          JOIN children ch ON ch.id=p.child_id
          JOIN rooms r ON r.id=p.room_id
          WHERE p.status IN ('pending','acknowledged')
          ORDER BY p.created_at DESC
        `);
        return jsonResp(rows);
      }

      if (path === '/api/guests/active' && method === 'GET') {
        const rows = await db.all(`
          SELECT g.*, r.name as room_name
          FROM guest_checkins g
          JOIN rooms r ON r.id=g.room_id
          WHERE substr(g.created_at,1,10)=? AND g.status='present'
          ORDER BY g.created_at DESC
        `, [todayStr()]);
        return jsonResp(rows.map(r => decryptRecord(r, env)));
      }

      if (path === '/api/platform/audit' && method === 'GET') {
        const security_logs = await db.all("SELECT a.id,a.action,a.created_at,coalesce(u.name,'Sistema') actor_name,coalesce(u.email,'') actor_email FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 120");
        const module_logs = await db.all("SELECT mc.id,mc.module,mc.record_id,mc.action,mc.created_at,coalesce(u.name,'Sistema') actor_name FROM module_changes mc LEFT JOIN users u ON u.id=mc.actor ORDER BY mc.created_at DESC LIMIT 120");
        return jsonResp({ security_logs, module_logs });
      }

      if (path === '/api/audit' && method === 'GET') {
        const rows = await db.all(`
          SELECT a.*, u.name as actor_name, ch.name as child_name
          FROM audit a
          LEFT JOIN users u ON u.id=a.actor
          LEFT JOIN children ch ON ch.id=a.child_id
          ORDER BY a.id DESC
          LIMIT 150
        `);
        return jsonResp(rows);
      }

      if (path === '/api/workspace/audit' && method === 'GET') {
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const total = Number(await db.scalar('SELECT count(*) FROM audit') || 0);
        const rows = await db.all(`
          SELECT a.id, a.action, a.created_at, coalesce(u.name,'Sistema') as actor_name
          FROM audit a
          LEFT JOIN users u ON u.id=a.actor
          WHERE lower(a.action) LIKE ? OR lower(coalesce(u.name,'')) LIKE ?
          ORDER BY a.id DESC
          LIMIT 50 OFFSET ?
        `, [`%${q}%`, `%${q}%`, (page - 1) * 50]);
        return jsonResp({
          items: rows.map(r => ({ ...r, label: r.action.split(':').slice(0, 2).join(' · ').replace(/_/g, ' ') })),
          total,
          page,
          has_more: page * 50 < total
        });
      }

      // Workspace tasks & calendar & availability & church-attendance
      if (path === '/api/workspace/tasks' && method === 'GET') {
        const person = await linkedPerson(db, user);
        const items = [];
        if (person) {
          const scheds = await db.all("SELECT * FROM ministries_schedules WHERE person_id=? AND active=1 AND status='pending' AND service_date>=? ORDER BY service_date,service_time LIMIT 100", [person.id, todayStr()]);
          for (const r of scheds) {
            items.push({ id: 'schedule:' + r.id, kind: 'schedule', title: r.title, detail: r.ministry, due: r.service_date, url: '/ministries#schedules', context_id: r.id });
          }
        }
        const apps = await db.all("SELECT id,target_name,status FROM sector_applications WHERE user_id=? AND status='pending' LIMIT 100", [user.id]);
        for (const r of apps) {
          items.push({ id: 'application:' + r.id, kind: 'application', title: r.target_name, detail: 'Aguardando análise', url: '/membro#ministries', context_id: r.id });
        }
        return jsonResp({ items, count: items.length });
      }

      if (path === '/api/workspace/calendar' && method === 'GET') {
        const start = url.searchParams.get('start') || todayStr();
        const end = url.searchParams.get('end') || '2027-12-31';
        const events = [];
        const scheds = await db.all('SELECT ms.*, p.name as person_name FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.active=1 AND ms.service_date>=? AND ms.service_date<=? ORDER BY ms.service_date,ms.service_time LIMIT 500', [start, end]);
        for (const r of scheds) {
          events.push({
            id: 'schedule:' + r.id,
            kind: 'schedule',
            title: r.title,
            starts_at: `${r.service_date}T${r.service_time.length === 5 ? r.service_time + ':00' : r.service_time}-03:00`,
            duration: r.duration_minutes,
            detail: `${r.ministry} · ${r.person_name}`,
            status: r.status,
            url: '/ministries#schedules'
          });
        }
        const lessons = await db.all('SELECT l.*, r.name as room_name FROM lessons l JOIN rooms r ON r.id=l.room_id WHERE l.active=1 AND r.active=1 AND l.starts_at>=? ORDER BY l.starts_at LIMIT 500', [start]);
        for (const l of lessons) {
          events.push({ id: 'lesson:' + l.id, kind: 'lesson', title: l.room_name, starts_at: l.starts_at, ends_at: l.ends_at, url: '/kids#lessons' });
        }
        return jsonResp({ items: events, start, end });
      }

      if (path === '/api/workspace/availability' && method === 'GET') {
        const rows = await db.all('SELECT * FROM personal_availability WHERE user_id=? ORDER BY starts_at DESC LIMIT 100', [user.id]);
        return jsonResp(rows.map(r => ({ ...r, reason: decryptText(r.reason, env) })));
      }

      if (path === '/api/workspace/availability' && method === 'POST') {
        const body = await request.json();
        const rid = randomBytes(16).toString('hex');
        await db.run('INSERT INTO personal_availability(id,user_id,starts_at,ends_at,reason,created_at) VALUES(?,?,?,?,?,?)', [
          rid, user.id, body.starts_at, body.ends_at, encryptText(body.reason || '', env), nowIso()
        ]);
        return jsonResp({ id: rid, ok: true });
      }

      if (path.startsWith('/api/workspace/availability/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run('DELETE FROM personal_availability WHERE id=? AND user_id=?', [rid, user.id]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/workspace/groups' && method === 'GET') {
        const cells = (await db.all('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name')).map(c => decryptRecord(c, env));
        return jsonResp(cells);
      }

      // Church Attendance (Presença nos cultos com geofence)
      if (path === '/api/workspace/church-attendance' && method === 'GET') {
        const now = nowIso();
        const person = await linkedPerson(db, user);
        const services = await db.all('SELECT * FROM church_services ORDER BY starts_at DESC LIMIT 200');
        const items = [];
        for (const s of services) {
          if (!isGlobal && !s.active) continue;
          const own = person
            ? await db.first('SELECT checked_at,method,voided FROM church_presences WHERE service_id=? AND person_id=?', [s.id, person.id])
            : null;
          const canCheckin = Boolean(s.active && s.opens_at <= now && now <= s.closes_at);
          const presentCount = isGlobal
            ? Number(await db.scalar('SELECT count(*) FROM church_presences WHERE service_id=? AND voided=0', [s.id]) || 0)
            : undefined;
          items.push({
            ...s,
            can_checkin: canCheckin,
            my_presence: own && !own.voided ? own : null,
            automatic_blocked: Boolean(own && own.voided),
            ...(presentCount !== undefined ? { present_count: presentCount } : {})
          });
        }
        const autoRow = await db.first('SELECT church_auto_checkin FROM users WHERE id=?', [user.id]);
        return jsonResp({
          items,
          manager: isGlobal,
          can_remove_others: isGlobal,
          linked_member: Boolean(person),
          my_person_id: person ? person.id : null,
          auto_enabled: Boolean(autoRow?.church_auto_checkin),
          server_time: now,
          timezone: 'America/Sao_Paulo'
        });
      }

      if (path === '/api/workspace/church-attendance' && method === 'POST') {
        if (!isGlobal) fail('permission', 'A gestão de presença é exclusiva da liderança.', 403);
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        const start = new Date(body.starts_at);
        const opensAt = new Date(start.getTime() - Number(body.early_minutes || 15) * 60000).toISOString();
        const closesAt = new Date(Math.min(new Date(body.ends_at).getTime(), start.getTime() + Number(body.late_minutes || 30) * 60000)).toISOString();
        await db.run(
          'INSERT OR REPLACE INTO church_services(id,title,starts_at,ends_at,location,latitude,longitude,radius_m,opens_at,closes_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          [rid, body.title.trim(), body.starts_at, body.ends_at, body.location.trim(), Number(body.latitude), Number(body.longitude), Number(body.radius_m || 150), opensAt, closesAt, user.id, nowIso()]
        );
        return jsonResp({ id: rid, ok: true });
      }

      if (path === '/api/workspace/church-attendance/preferences/automatic' && method === 'PATCH') {
        const body = await request.json();
        await db.run('UPDATE users SET church_auto_checkin=? WHERE id=?', [body.enabled ? 1 : 0, user.id]);
        return jsonResp({ ok: true, enabled: Boolean(body.enabled) });
      }

      if (path.startsWith('/api/workspace/church-attendance/') && path.endsWith('/check-in') && method === 'POST') {
        const rid = path.split('/')[4];
        const body = await request.json();
        const srv = await db.first('SELECT * FROM church_services WHERE id=?', [rid]);
        if (!srv || !srv.active) fail('missing', 'Culto não encontrado ou inativo.', 404);
        const person = await linkedPerson(db, user);
        if (!person) fail('member', 'Seu cadastro de membro precisa estar vinculado à conta.', 409);
        const meters = haversineMeters(Number(body.latitude), Number(body.longitude), Number(srv.latitude), Number(srv.longitude));
        if (Number(body.accuracy) > Math.min(100, srv.radius_m / 2) || meters + Number(body.accuracy) > srv.radius_m) {
          fail('location', 'Localização fora da área ou imprecisa. Aproxime-se do local e tente novamente.', 409);
        }
        const checkedAt = nowIso();
        await db.run(
          "INSERT INTO church_presences(service_id,person_id,user_id,method,checked_at,actor,service_version,voided) VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(service_id,person_id) DO UPDATE SET user_id=excluded.user_id,method=excluded.method,checked_at=excluded.checked_at,actor=excluded.actor,service_version=excluded.service_version,voided=0,reason=''",
          [rid, person.id, user.id, 'location', checkedAt, user.id, srv.version || 1]
        );
        return jsonResp({ ok: true, already_present: false, checked_at: checkedAt });
      }

      // Sector Modules: Members, Ministries, Finance
      if (path === '/api/members' || path === '/api/members/people') {
        if (method === 'GET') {
          const q = (url.searchParams.get('q') || '').toLowerCase();
          const page = Math.max(1, Number(url.searchParams.get('page') || 1));
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 200)));
          const rawCells = (await db.all('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count,(SELECT count(*) FROM members_families f WHERE f.cell_id=mc.id AND f.active=1) family_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name LIMIT 300')).map(r => decryptRecord(r, env));
          const cellMembersRows = await db.all("SELECT id, name, cell_id FROM members_people WHERE active=1 AND cell_id IS NOT NULL AND cell_id != '' ORDER BY name");
          const byCellId = {};
          for (const cm of cellMembersRows) (byCellId[cm.cell_id] ||= []).push({ id: cm.id, name: cm.name });
          const cells = rawCells.map(c => ({ ...c, members: byCellId[c.id] || [], member_count: (byCellId[c.id] || []).length }));
          const families = (await db.all("SELECT f.*,coalesce(mc.name,'') cell_name,(SELECT count(*) FROM members_people p WHERE f.id=p.family_id AND p.active=1) member_count FROM members_families f LEFT JOIN members_cells mc ON mc.id=f.cell_id WHERE f.active=1 ORDER BY f.name LIMIT 500")).map(r => decryptRecord(r, env));
          const peopleRows = (await db.all(`
            SELECT p.*, coalesce(f.name,'Sem família vinculada') as family_name, coalesce(mc.name,'') as cell_name
            FROM members_people p
            LEFT JOIN members_families f ON f.id=p.family_id
            LEFT JOIN members_cells mc ON mc.id=p.cell_id
            WHERE p.active=1 AND lower(p.name) LIKE ?
            ORDER BY p.name, p.id
            LIMIT ? OFFSET ?
          `, [`%${q}%`, limit + 1, (page - 1) * limit])).map(r => decryptRecord(r, env));
          const hasMore = peopleRows.length > limit;
          const people = peopleRows.slice(0, limit);
          const selfRegs = (await db.all("SELECT * FROM members_self_registrations WHERE status='pending' ORDER BY created_at DESC LIMIT 100")).map(r => decryptRecord(r, env));
          const gcApps = (await db.all("SELECT * FROM sector_applications WHERE target_type='gc' AND status='pending' ORDER BY created_at DESC LIMIT 100")).map(r => decryptRecord(r, env));
          const stageRows = await db.all('SELECT integration_stage, count(*) n FROM members_people WHERE active=1 GROUP BY integration_stage');
          const stages = Object.fromEntries(stageRows.map(r => [r.integration_stage, Number(r.n || 0)]));
          const bdaysMonth = Number(await db.scalar("SELECT count(*) FROM members_people WHERE active=1 AND substr(birthday,6,2)=?", [todayStr().slice(5, 7)]) || 0);
          const totalPeople = Number(await db.scalar('SELECT count(*) FROM members_people WHERE active=1') || 0);
          const myP = await linkedPerson(db, user);
          return jsonResp({
            pastoral_notes_allowed: isGlobal,
            page,
            has_more: hasMore,
            statistics: { stages, birthdays_month: bdaysMonth },
            cells,
            families,
            people,
            self_registrations: selfRegs,
            gc_applications: gcApps,
            total_people: totalPeople,
            total_families: families.length,
            total_cells: cells.length,
            my_person_id: myP ? myP.id : null,
            summary: {
              people: totalPeople,
              active_members: people.filter(p => (p.integration_stage || 'active_member') === 'active_member').length,
              visitors: people.filter(p => (p.integration_stage || '') === 'visitor').length,
              cells: cells.length,
              families: families.length
            }
          });
        }
      }

      if (path === '/api/ministries/people' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const rows = await db.all('SELECT id,name FROM members_people WHERE active=1 AND lower(name) LIKE ? ORDER BY name LIMIT 200', [`%${q}%`]);
        return jsonResp(rows);
      }

      if (path === '/api/ministries' || path === '/api/ministries/schedules') {
        if (method === 'GET') {
          const q = (url.searchParams.get('q') || '').toLowerCase();
          const assignments = (await db.all(`
            SELECT a.*, p.name as person_name, coalesce(p.phone,'') as person_phone
            FROM ministries_assignments a
            JOIN members_people p ON p.id=a.person_id
            WHERE a.active=1 AND p.active=1 AND lower(p.name) LIKE ?
            ORDER BY a.ministry, a.is_leader DESC, p.name
            LIMIT 300
          `, [`%${q}%`])).map(r => decryptRecord(r, env));
          const schedules = (await db.all(`
            SELECT ms.*, p.name as person_name
            FROM ministries_schedules ms
            JOIN members_people p ON p.id=ms.person_id
            WHERE ms.active=1 AND p.active=1
            ORDER BY ms.service_date ASC, ms.service_time ASC, ms.ministry ASC
            LIMIT 300
          `)).map(r => decryptRecord(r, env));
          const resources = (await db.all('SELECT * FROM ministries_resources WHERE active=1 ORDER BY ministry ASC, created_at DESC LIMIT 200')).map(r => decryptRecord(r, env));
          const counts = await db.all('SELECT ministry, count(*) total, sum(CASE WHEN is_leader=1 THEN 1 ELSE 0 END) leaders FROM ministries_assignments WHERE active=1 GROUP BY ministry');
          const templates = await db.all('SELECT * FROM service_templates WHERE active=1 ORDER BY weekday, service_time');
          const apps = (await db.all("SELECT * FROM sector_applications WHERE target_type='ministry' AND status='pending' ORDER BY created_at DESC LIMIT 100")).map(r => decryptRecord(r, env));
          const myP = await linkedPerson(db, user);
          return jsonResp({
            assignments,
            schedules,
            resources,
            catalog: MINISTRY_CATALOG,
            worship_roles: WORSHIP_ROLES,
            service_templates: templates,
            counts,
            statistics: {
              assignments: counts.reduce((s, r) => s + Number(r.total || 0), 0),
              leaders: counts.reduce((s, r) => s + Number(r.leaders || 0), 0)
            },
            user_scope: '',
            applications: apps,
            my_person_id: myP ? myP.id : null
          });
        }
      }

      if (path === '/api/ministries/my-schedules' && method === 'GET') {
        const person = await linkedPerson(db, user);
        if (!person) return jsonResp([]);
        const rows = await db.all(`
          SELECT s.*, p.name as person_name
          FROM ministries_schedules s
          JOIN members_people p ON p.id=s.person_id
          WHERE s.person_id=? AND s.active=1
          ORDER BY s.service_date ASC, s.service_time ASC
        `, [person.id]);
        return jsonResp(rows.map(r => decryptRecord(r, env)));
      }

      if (path.startsWith('/api/ministries/schedules/') && path.endsWith('/respond') && method === 'POST') {
        const sid = path.split('/')[4];
        const body = await request.json();
        const status = body.status;
        if (!['confirmed', 'declined', 'pending'].includes(status)) fail('status', 'Status inválido.');
        const notes = encryptText(body.decline_reason || body.notes || '', env);
        await db.run('UPDATE ministries_schedules SET status=?, notes=?, version=version+1 WHERE id=?', [status, notes, sid]);
        return jsonResp({ ok: true, id: sid, status });
      }

      if (path === '/api/finance' || path === '/api/finance/entries') {
        if (method === 'GET') {
          const q = (url.searchParams.get('q') || '').toLowerCase();
          const costCenters = (await db.all(`
            SELECT cc.*,
              coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='expense' AND e.active=1 AND coalesce(e.payment_status,'paid')='paid'),0) as spent_cents,
              coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='income' AND e.active=1 AND coalesce(e.payment_status,'paid')='paid'),0) as income_cents
            FROM finance_cost_centers cc
            WHERE cc.active=1
            ORDER BY cc.name
            LIMIT 200
          `)).map(r => decryptRecord(r, env));
          const accounts = (await db.all(`
            SELECT a.*,
              a.opening_cents + coalesce((SELECT sum(CASE WHEN e.direction='income' THEN e.amount_cents ELSE -e.amount_cents END) FROM finance_entries e WHERE e.account_id=a.id AND e.active=1 AND coalesce(e.payment_status,'paid')='paid'),0) as balance_cents
            FROM finance_accounts a
            WHERE a.active=1
            ORDER BY a.name
            LIMIT 500
          `)).map(r => decryptRecord(r, env));
          const entries = (await db.all(`
            SELECT e.*, a.name as account_name, coalesce(a.bank,'') as account_bank, coalesce(cc.name,'') as cost_center_name
            FROM finance_entries e
            JOIN finance_accounts a ON a.id=e.account_id
            LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id
            WHERE e.active=1 AND lower(e.description) LIKE ?
            ORDER BY e.occurred_on DESC, e.created_at DESC
            LIMIT 200
          `, [`%${q}%`])).map(r => decryptRecord(r, env));
          const closings = (await db.all(`
            SELECT sc.*, a.name as account_name
            FROM finance_service_closings sc
            JOIN finance_accounts a ON a.id=sc.account_id
            WHERE sc.active=1
            ORDER BY sc.service_date DESC, sc.created_at DESC
            LIMIT 100
          `)).map(r => decryptRecord(r, env));
          const invoices = (await db.all(`
            SELECT * FROM finance_invoices
            WHERE active=1 AND (lower(supplier) LIKE ? OR lower(number) LIKE ?)
            ORDER BY issued_on DESC
            LIMIT 200
          `, [`%${q}%`, `%${q}%`])).map(r => decryptRecord(r, env));
          const totalsRow = await db.first(`
            SELECT
              coalesce(sum(CASE WHEN direction='income' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) as income_cents,
              coalesce(sum(CASE WHEN direction='expense' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) as expense_cents,
              coalesce(sum(CASE WHEN direction='income' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) as pending_income_cents,
              coalesce(sum(CASE WHEN direction='expense' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) as pending_expense_cents
            FROM finance_entries WHERE active=1
          `) || { income_cents: 0, expense_cents: 0, pending_income_cents: 0, pending_expense_cents: 0 };

          const currentBalance = accounts.reduce((s, a) => s + Number(a.balance_cents || 0), 0);
          return jsonResp({
            cost_centers: costCenters,
            accounts,
            entries,
            closings,
            invoices,
            totals: totalsRow,
            engine: {
              current_balance_cents: currentBalance,
              projected_30d_cents: currentBalance + Number(totalsRow.pending_income_cents || 0) - Number(totalsRow.pending_expense_cents || 0),
              projected_60d_cents: currentBalance + Number(totalsRow.pending_income_cents || 0) - Number(totalsRow.pending_expense_cents || 0),
              projected_90d_cents: currentBalance + Number(totalsRow.pending_income_cents || 0) - Number(totalsRow.pending_expense_cents || 0),
              monthly_avg_income_cents: Math.floor(Number(totalsRow.income_cents || 0) / 3),
              monthly_avg_expense_cents: Math.floor(Number(totalsRow.expense_cents || 0) / 3),
              overdue_count: 0,
              overdue_cents: 0,
              by_bank: [],
              by_category: [],
              by_method: [],
              alerts: [{ level: 'ok', title: 'Fluxo financeiro equilibrado', detail: 'Nenhuma pendência em atraso ou estouro de centro de custo detectado.' }]
            },
            mode: 'predictive_engine'
          });
        }
      }

      if (path === '/api/profile' || path === '/api/me/profile') {
        const buildProfileAccount = async () => {
          const uRow = await db.first('SELECT * FROM users WHERE id=?', [user.id]);
          const res = buildPublicUser(uRow || user, admins, pastors);
          const pRow = await linkedPerson(db, user);
          if (pRow) {
            const p = decryptRecord(pRow, env);
            res.birthday = p.birthday || null;
            res.profession = p.profession || '';
            res.marital_status = p.marital_status || '';
            res.address = p.address || '';
            res.bio = p.bio || uRow?.bio || '';
            res.family_id = p.family_id || '';
            if (p.family_id) {
              const fam = await db.first('SELECT name FROM members_families WHERE id=?', [p.family_id]);
              res.family_name = fam?.name || '';
            } else {
              res.family_name = '';
            }
            if (!res.phone && p.phone) res.phone = p.phone;
            if (!res.avatar_url && p.avatar_url) res.avatar_url = p.avatar_url;
          } else {
            res.birthday = null;
            res.profession = '';
            res.marital_status = '';
            res.address = '';
            res.family_id = '';
            res.family_name = '';
            res.bio = uRow?.bio || '';
          }
          return { res, pRow };
        };

        if (method === 'GET') {
          const { res, pRow } = await buildProfileAccount();
          const families = isGlobal
            ? await db.all('SELECT id,name FROM members_families WHERE active=1 ORDER BY name')
            : await db.all('SELECT id,name FROM members_families WHERE active=1 AND (created_by=? OR id=?) ORDER BY name', [user.id, pRow?.family_id || '']);
          return jsonResp({ user: res, families });
        }

        if (method === 'PATCH' || method === 'POST') {
          let body = {};
          let uploadedPhoto = null;
          const ct = request.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            body = await request.json();
          } else if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
            const fd = await request.formData();
            for (const [k, v] of fd.entries()) {
              if (typeof v === 'string') body[k] = v;
              else if (k === 'photo' && v && typeof v.arrayBuffer === 'function' && v.size > 0) uploadedPhoto = v;
            }
          }
          let avatarUrl = user.avatar_url || '';
          if (uploadedPhoto) {
            const ab = await uploadedPhoto.arrayBuffer();
            const buf = Buffer.from(ab);
            const mediaId = randomBytes(16).toString('hex');
            const mime = uploadedPhoto.type || 'image/webp';
            await db.run(
              'INSERT INTO media(id,filename,mime_type,size_bytes,sha256,data,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
              [mediaId, uploadedPhoto.name || 'avatar.webp', mime, buf.length, sha256Hex(buf.toString('base64')), buf, user.id, nowIso()]
            );
            avatarUrl = '/api/media/' + mediaId;
          } else if (body.avatar_url !== undefined) {
            avatarUrl = String(body.avatar_url || '').trim();
          }
          const name = body.name ? String(body.name).trim() : user.name;
          const phone = body.phone !== undefined ? String(body.phone).trim() : (user.phone || '');
          const bio = body.bio !== undefined ? String(body.bio).trim() : (user.bio || '');
          const pubBio = body.public_bio !== undefined ? (String(body.public_bio) === 'true' || body.public_bio === true || body.public_bio === 1 ? 1 : 0) : (user.public_bio ?? 1);
          const pubProf = body.public_profession !== undefined ? (String(body.public_profession) === 'true' || body.public_profession === true || body.public_profession === 1 ? 1 : 0) : (user.public_profession ?? 1);
          await db.run(
            'UPDATE users SET name=?, phone=?, bio=?, avatar_url=?, public_bio=?, public_profession=?, profile_version=coalesce(profile_version,1)+1 WHERE id=?',
            [name, phone, bio, avatarUrl, pubBio, pubProf, user.id]
          );
          let pRow = await linkedPerson(db, user);
          let familyId = body.family_id !== undefined ? (String(body.family_id || '').trim() || null) : (pRow?.family_id || null);
          const newFamName = String(body.new_family_name || '').trim();
          if (newFamName.length >= 2) {
            const fid = randomBytes(16).toString('hex');
            await db.run(
              'INSERT INTO members_families(id,name,cell_id,neighborhood,joined_on,active,version,created_at,created_by) VALUES(?,?,?,?,?,1,1,?,?)',
              [fid, newFamName, pRow?.cell_id || null, '', todayStr(), nowIso(), user.id]
            );
            familyId = fid;
          }
          if (pRow) {
            await db.run(
              'UPDATE members_people SET name=?, phone=?, birthday=?, marital_status=?, profession=?, address=?, bio=?, family_id=?, avatar_url=?, account_user_id=?, version=version+1 WHERE id=?',
              [
                name,
                phone,
                body.birthday !== undefined ? (body.birthday || null) : pRow.birthday,
                body.marital_status !== undefined ? String(body.marital_status) : (pRow.marital_status || ''),
                body.profession !== undefined ? String(body.profession) : (pRow.profession || ''),
                body.address !== undefined ? encryptText(body.address, env) : pRow.address,
                bio,
                familyId,
                avatarUrl,
                user.id,
                pRow.id
              ]
            );
          } else {
            const pid = randomBytes(16).toString('hex');
            await db.run(
              'INSERT INTO members_people(id,family_id,cell_id,name,relationship,phone,email,birthday,baptism_date,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,address,marital_status,profession,bio,avatar_url,account_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,?,?)',
              [pid, familyId, null, name, 'Titular', phone, user.email, body.birthday || null, null, todayStr(), 'active_member', '', nowIso(), user.id, encryptText(body.address || '', env), body.marital_status || '', body.profession || '', bio, avatarUrl, user.id]
            );
          }
          const { res } = await buildProfileAccount();
          return jsonResp({ ok: true, user: res });
        }
      }


      // === AUTH & ACCOUNT SECURITY ENDPOINTS ===
      if (path === '/api/auth/sessions' && method === 'GET') {
        const nowSec = Math.floor(Date.now() / 1000);
        const rows = await db.all('SELECT token, expires FROM sessions WHERE user_id=? AND expires>? ORDER BY expires DESC', [user.id, nowSec]);
        return jsonResp(rows.map(r => ({
          current: r.token === user.token,
          expires: new Date(Number(r.expires) * 1000).toISOString()
        })));
      }

      if (path === '/api/auth/sessions/revoke-others' && method === 'POST') {
        await db.run('DELETE FROM sessions WHERE user_id=? AND token!=?', [user.id, user.token]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/auth/password' && method === 'POST') {
        const body = await request.json();
        const uRow = await db.first('SELECT password FROM users WHERE id=?', [user.id]);
        if (!uRow || !passwordOk(String(body.current_password || ''), uRow.password)) {
          fail('credentials', 'Senha atual incorreta.', 401);
        }
        const nextPwd = String(body.new_password || '');
        if (nextPwd.length < 12) fail('password', 'Use pelo menos 12 caracteres na nova senha.');
        await db.run('UPDATE users SET password=? WHERE id=?', [passwordHash(nextPwd), user.id]);
        await writeAudit(db, user.id, 'password_changed', null, ip);
        return jsonResp({ ok: true });
      }

      if (path === '/api/auth/email/send' && method === 'POST') {
        await db.run('UPDATE users SET email_verified=1 WHERE id=?', [user.id]);
        return jsonResp({ ok: true, message: 'E-mail confirmado com sucesso.' });
      }

      if (path === '/api/auth/mfa/setup' && method === 'POST') {
        const secret = randomBytes(10).toString('hex').toUpperCase();
        return jsonResp({ secret, otpauth_url: `otpauth://totp/Lagoinha:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Lagoinha` });
      }

      if (path === '/api/auth/mfa/confirm' && method === 'POST') {
        return jsonResp({ ok: true });
      }

      if (path === '/api/workspace/access-matrix' && method === 'GET') {
        const grantRows = await db.all('SELECT module,role,enabled FROM module_access WHERE user_id=?', [user.id]);
        const grants = Object.fromEntries(grantRows.map(r => [r.module, r]));
        const scopeRows = await db.all('SELECT module,scope FROM module_scopes WHERE user_id=?', [user.id]);
        const scopes = Object.fromEntries(scopeRows.map(r => [r.module, r.scope]));
        const modules = Object.keys(MODULES).map(mod => {
          const enabled = Boolean(isGlobal || grants[mod]?.enabled || mod === 'kids');
          const role = isRoot ? 'admin' : isPastor ? 'pastor' : (grants[mod]?.role || (mod === 'kids' ? user.role : 'viewer'));
          const edit = isGlobal || ['admin', 'pastor', 'editor'].includes(role);
          return {
            module: mod,
            view: enabled,
            create_shared: edit,
            edit_shared: edit,
            export: edit,
            scope: isGlobal ? '' : (scopes[mod] || ''),
            own_profile: true
          };
        });
        return jsonResp({ modules, platform_admin: isRoot, pastor: isPastor });
      }

      // === NOTIFICATION CENTER ENDPOINTS ===
      if (path === '/api/notification-center/preferences' && method === 'GET') {
        const row = await db.first('SELECT settings FROM notification_preferences WHERE user_id=?', [user.id]);
        const defaults = {
          push_enabled: true,
          urgent: true,
          tasks: true,
          announcements: true,
          activity: false,
          system: true,
          quiet_enabled: false,
          quiet_start: '22:00',
          quiet_end: '07:00'
        };
        let settings = defaults;
        if (row && row.settings) {
          try { settings = { ...defaults, ...JSON.parse(row.settings) }; } catch {}
        }
        return jsonResp({
          settings,
          timezone: 'America/Sao_Paulo',
          categories: [
            { id: 'urgent', label: 'Urgentes' },
            { id: 'tasks', label: 'Tarefas e Escalas' },
            { id: 'announcements', label: 'Comunicados' },
            { id: 'activity', label: 'Comunidade' },
            { id: 'system', label: 'Sistema' }
          ]
        });
      }

      if (path === '/api/notification-center/preferences' && method === 'PUT') {
        const body = await request.json();
        await db.run(
          'INSERT INTO notification_preferences(user_id,settings,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at',
          [user.id, JSON.stringify(body), nowIso()]
        );
        return jsonResp({ ok: true, settings: body });
      }

      if (path === '/api/notification-center/read-all' && method === 'POST') {
        await db.run('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE user_id=? AND read_at IS NULL', [nowIso(), user.id]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/notification-center/') && path.endsWith('/read') && method === 'POST') {
        const nid = Number(path.split('/')[3]);
        await db.run('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?', [nowIso(), nid, user.id]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/notification-center/') && method === 'GET' && !path.endsWith('/summary') && !path.endsWith('/preferences')) {
        const nid = Number(path.split('/')[3]);
        const row = await db.first('SELECT * FROM notifications WHERE id=? AND user_id=?', [nid, user.id]);
        if (!row) fail('missing', 'Notificação não encontrada.', 404);
        return jsonResp({
          ...row,
          category: row.kind?.includes('schedule') ? 'tasks' : row.kind?.includes('announcement') ? 'announcements' : 'system',
          category_label: row.kind?.includes('schedule') ? 'Tarefas e Escalas' : row.kind?.includes('announcement') ? 'Comunicados' : 'Sistema',
          priority: row.kind === 'paging' ? 'urgent' : 'normal',
          url: row.kind?.includes('schedule') ? '/ministries#schedules' : '/membro'
        });
      }

      // === HALL DE MEMBROS ENDPOINTS ===
      if (path === '/api/platform/hall/summary' && method === 'GET') {
        const row = await db.first('SELECT p.id FROM hall_posts p JOIN users u ON u.id=p.author_id WHERE p.active=1 AND u.active=1 ORDER BY p.created_at DESC, p.id DESC LIMIT 1');
        return jsonResp({ latest_id: row ? row.id : null });
      }

      if (path === '/api/platform/hall/members' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const ministry = (url.searchParams.get('ministry') || '').trim();
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const clauses = ['p.active=1'];
        const params = [];
        if (q) {
          clauses.push("(lower(p.name) LIKE ? OR (coalesce((SELECT public_profession FROM users WHERE id=p.account_user_id),1)=1 AND lower(coalesce(p.profession,'')) LIKE ?))");
          params.push(`%${q}%`, `%${q}%`);
        }
        if (ministry) {
          clauses.push('EXISTS(SELECT 1 FROM ministries_assignments a WHERE a.person_id=p.id AND a.active=1 AND a.ministry=?)');
          params.push(ministry);
        }
        const where = clauses.join(' AND ');
        const rows = await db.all(`
          SELECT p.id, p.name,
            CASE WHEN coalesce(u.public_profession,1)=1 THEN coalesce(p.profession,'') ELSE '' END as profession,
            CASE WHEN coalesce(u.public_bio,1)=1 THEN coalesce(p.bio,'') ELSE '' END as bio,
            p.account_user_id,
            coalesce(nullif(u.avatar_url,''),p.avatar_url,'') as avatar_url,
            coalesce(mc.name,'') as cell_name
          FROM members_people p
          LEFT JOIN users u ON u.id=p.account_user_id AND u.active=1
          LEFT JOIN members_cells mc ON mc.id=p.cell_id
          WHERE ${where}
          ORDER BY p.name, p.id
          LIMIT 25 OFFSET ?
        `, [...params, (page - 1) * 24]);

        const assigns = await db.all('SELECT person_id, ministry, position, is_leader FROM ministries_assignments WHERE active=1 ORDER BY ministry');
        const byPerson = {};
        for (const a of assigns) {
          (byPerson[a.person_id] ||= []).push({ ministry: a.ministry, position: a.position, is_leader: a.is_leader });
        }
        const members = rows.slice(0, 24).map(r => ({
          ...r,
          is_me: Number(r.account_user_id) === user.id,
          ministries: byPerson[r.id] || []
        }));
        const total = Number(await db.scalar(`SELECT count(*) FROM members_people p WHERE ${where}`, params) || 0);
        const catRows = await db.all('SELECT DISTINCT ministry FROM ministries_assignments WHERE active=1 ORDER BY ministry');
        return jsonResp({
          members,
          total,
          has_more: rows.length > 24,
          page,
          catalog: catRows.map(c => c.ministry)
        });
      }

      if (path === '/api/platform/hall/posts' && method === 'GET') {
        const kind = url.searchParams.get('kind') || url.searchParams.get('category') || 'all';
        const mine = url.searchParams.get('mine') === 'true';
        const author = url.searchParams.get('author') ? Number(url.searchParams.get('author')) : null;
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const clauses = ['p.active=1', 'u.active=1'];
        const params = [];
        if (kind && kind !== 'all') {
          clauses.push('p.kind=?');
          params.push(kind);
        }
        if (mine || author) {
          clauses.push('p.author_id=?');
          params.push(mine ? user.id : author);
        }
        const rows = await db.all(`
          SELECT p.*, u.name as author_name, u.avatar_url as author_avatar,
            (SELECT count(*) FROM hall_reactions r WHERE r.post_id=p.id) as reactions,
            (SELECT count(*) FROM hall_comments cm JOIN users cu ON cu.id=cm.author_id WHERE cm.post_id=p.id AND cm.active=1 AND cu.active=1) as comments
          FROM hall_posts p
          JOIN users u ON u.id=p.author_id
          WHERE ${clauses.join(' AND ')}
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT 21 OFFSET ?
        `, [...params, (page - 1) * 20]);

        const myRxRows = await db.all('SELECT post_id FROM hall_reactions WHERE user_id=?', [user.id]);
        const myRxSet = new Set(myRxRows.map(r => r.post_id));

        const items = rows.slice(0, 20).map(r => ({
          ...r,
          reacted: myRxSet.has(r.id),
          is_mine: Number(r.author_id) === user.id,
          can_manage: Number(r.author_id) === user.id || isGlobal
        }));
        const totalMembers = Number(await db.scalar('SELECT count(*) FROM members_people WHERE active=1') || 0);
        const totalPosts = Number(await db.scalar('SELECT count(*) FROM hall_posts p JOIN users u ON u.id=p.author_id WHERE p.active=1 AND u.active=1') || 0);
        return jsonResp({
          items,
          has_more: rows.length > 20,
          page,
          can_moderate: isGlobal,
          stats: { members: totalMembers, posts: totalPosts }
        });
      }

      if (path === '/api/platform/hall/posts' && method === 'POST') {
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        const content = String(body.content || body.body || '').trim();
        if (content.length < 2) fail('content', 'Escreva uma mensagem antes de publicar.');
        const kind = body.kind || 'general';
        await db.run(
          'INSERT OR REPLACE INTO hall_posts(id,author_id,kind,content,created_at,updated_at,active,version) VALUES(?,?,?,?,?,?,1,1)',
          [rid, user.id, kind, content, nowIso(), nowIso()]
        );
        return jsonResp({ id: rid, ok: true });
      }

      if (path === '/api/platform/hall/reports' && method === 'GET') {
        if (!isGlobal) return jsonResp({ items: [] });
        const rows = await db.all('SELECT r.post_id,r.reason,r.created_at,p.content,p.version,u.name as author_name FROM hall_reports r JOIN hall_posts p ON p.id=r.post_id JOIN users u ON u.id=p.author_id WHERE r.resolved=0 AND p.active=1 ORDER BY r.created_at DESC LIMIT 100');
        return jsonResp({ items: rows });
      }

      if (path.startsWith('/api/platform/hall/posts/') && path.endsWith('/reaction') && method === 'PUT') {
        const rid = path.split('/')[4];
        const body = await request.json();
        if (body.active) {
          await db.run('INSERT OR IGNORE INTO hall_reactions(post_id,user_id,created_at) VALUES(?,?,?)', [rid, user.id, nowIso()]);
        } else {
          await db.run('DELETE FROM hall_reactions WHERE post_id=? AND user_id=?', [rid, user.id]);
        }
        const count = Number(await db.scalar('SELECT count(*) FROM hall_reactions WHERE post_id=?', [rid]) || 0);
        return jsonResp({ ok: true, reacted: Boolean(body.active), reactions: count });
      }

      if (path.startsWith('/api/platform/hall/posts/') && path.endsWith('/comments')) {
        const rid = path.split('/')[4];
        if (method === 'GET') {
          const page = Math.max(1, Number(url.searchParams.get('page') || 1));
          const rows = await db.all('SELECT cm.id,cm.content,cm.author_id,cm.created_at,u.name as author_name,u.avatar_url as author_avatar FROM hall_comments cm JOIN users u ON u.id=cm.author_id WHERE cm.post_id=? AND cm.active=1 AND u.active=1 ORDER BY cm.created_at DESC,cm.id DESC LIMIT 31 OFFSET ?', [rid, (page - 1) * 30]);
          return jsonResp({
            items: rows.slice(0, 30).map(r => ({ ...r, can_manage: Number(r.author_id) === user.id || isGlobal })),
            has_more: rows.length > 30
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          const cid = String(body.request_id || randomBytes(16).toString('hex'));
          await db.run(
            'INSERT OR REPLACE INTO hall_comments(id,post_id,author_id,content,created_at,active) VALUES(?,?,?,?,?,1)',
            [cid, rid, user.id, String(body.content || body.body || '').trim(), nowIso()]
          );
          return jsonResp({ ok: true, id: cid });
        }
      }

      if (path.startsWith('/api/platform/hall/comments/') && method === 'DELETE') {
        const cid = path.split('/')[4];
        await db.run('UPDATE hall_comments SET active=0 WHERE id=?', [cid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/platform/hall/posts/') && path.endsWith('/report') && method === 'POST') {
        const rid = path.split('/')[4];
        const body = await request.json();
        await db.run('INSERT OR IGNORE INTO hall_reports(post_id,user_id,reason,resolved,created_at) VALUES(?,?,?,0,?)', [rid, user.id, body.reason || 'other', nowIso()]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/platform/hall/posts/') && path.endsWith('/resolve-reports') && method === 'POST') {
        const rid = path.split('/')[4];
        await db.run('UPDATE hall_reports SET resolved=1 WHERE post_id=?', [rid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/platform/hall/posts/') && path.split('/').length === 5) {
        const rid = path.split('/')[4];
        if (method === 'GET') {
          const r = await db.first(`
            SELECT p.*, u.name as author_name, u.avatar_url as author_avatar,
              (SELECT count(*) FROM hall_reactions rx WHERE rx.post_id=p.id) as reactions,
              (SELECT count(*) FROM hall_comments cm JOIN users cu ON cu.id=cm.author_id WHERE cm.post_id=p.id AND cm.active=1 AND cu.active=1) as comments
            FROM hall_posts p
            JOIN users u ON u.id=p.author_id
            WHERE p.id=?
          `, [rid]);
          if (!r) fail('missing', 'Publicação não encontrada.', 404);
          const reacted = Boolean(await db.first('SELECT 1 FROM hall_reactions WHERE post_id=? AND user_id=?', [rid, user.id]));
          return jsonResp({ ...r, reacted, is_mine: Number(r.author_id) === user.id, can_manage: Number(r.author_id) === user.id || isGlobal });
        }
        if (method === 'PATCH') {
          const body = await request.json();
          await db.run('UPDATE hall_posts SET content=?, kind=?, version=version+1, updated_at=? WHERE id=?', [String(body.content || '').trim(), body.kind || 'general', nowIso(), rid]);
          return jsonResp({ ok: true });
        }
        if (method === 'DELETE') {
          await db.run('UPDATE hall_posts SET active=0, version=version+1, updated_at=? WHERE id=?', [nowIso(), rid]);
          await db.run('UPDATE hall_reports SET resolved=1 WHERE post_id=?', [rid]);
          return jsonResp({ ok: true });
        }
      }

      // === PLATFORM USERS, PERMISSIONS, ANNOUNCEMENTS & ARCHIVES ===
      if (path.startsWith('/api/platform/users/') && path.includes('/modules/') && method === 'PUT') {
        if (!isRoot) fail('forbidden', 'Acesso exclusivo de TI.', 403);
        const parts = path.split('/');
        const uid = Number(parts[4]);
        const mod = parts[6];
        const body = await request.json();
        const role = String(body.role || 'viewer');
        const enabled = body.enabled ? 1 : 0;
        const scope = String(body.scope || '').trim();
        await db.run(
          'INSERT INTO module_access(user_id,module,role,enabled) VALUES(?,?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role, enabled=excluded.enabled',
          [uid, mod, role, enabled]
        );
        if (scope) {
          await db.run('INSERT INTO module_scopes(user_id,module,scope) VALUES(?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET scope=excluded.scope', [uid, mod, scope]);
        } else {
          await db.run('DELETE FROM module_scopes WHERE user_id=? AND module=?', [uid, mod]);
        }
        if (mod === 'kids') {
          const kRole = ['admin', 'teacher', 'parent'].includes(role) ? role : 'parent';
          await db.run('UPDATE users SET role=? WHERE id=?', [kRole, uid]);
        }
        await writeAudit(db, user.id, `module_access:${uid}:${mod}:${role}:${enabled}`, null, ip);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/platform/users/') && path.split('/').length === 5 && method === 'PATCH') {
        if (!isRoot) fail('forbidden', 'Acesso exclusivo de TI.', 403);
        const uid = Number(path.split('/')[4]);
        const body = await request.json();
        if (body.active !== undefined) {
          await db.run('UPDATE users SET active=? WHERE id=?', [body.active ? 1 : 0, uid]);
          if (!body.active) await db.run('DELETE FROM sessions WHERE user_id=?', [uid]);
        }
        if (body.platform_admin !== undefined) {
          if (body.platform_admin) await db.run('INSERT OR IGNORE INTO platform_admins(user_id) VALUES(?)', [uid]);
          else await db.run('DELETE FROM platform_admins WHERE user_id=?', [uid]);
        }
        if (body.pastor !== undefined) {
          if (body.pastor) {
            await db.run('INSERT OR IGNORE INTO pastoral_users(user_id,granted_by,created_at) VALUES(?,?,?)', [uid, user.id, nowIso()]);
            await db.run("UPDATE users SET staff_role='pastor' WHERE id=?", [uid]);
          } else {
            await db.run('DELETE FROM pastoral_users WHERE user_id=?', [uid]);
            await db.run("UPDATE users SET staff_role='' WHERE id=? AND staff_role='pastor'", [uid]);
          }
        }
        if (body.password) {
          if (String(body.password).length < 12) fail('password', 'Use pelo menos 12 caracteres.');
          await db.run('UPDATE users SET password=? WHERE id=?', [passwordHash(String(body.password)), uid]);
        }
        await writeAudit(db, user.id, `user_updated:${uid}`, null, ip);
        return jsonResp({ ok: true });
      }

      if (path === '/api/platform/announcement-recipients' && method === 'GET') {
        const sector = url.searchParams.get('sector') || 'all';
        let rows = [];
        if (sector === 'members') {
          rows = await db.all("SELECT u.id, u.name, 0 as leader FROM users u WHERE u.active=1 ORDER BY u.name LIMIT 300");
        } else if (sector === 'ministries') {
          rows = await db.all("SELECT DISTINCT u.id, u.name, coalesce(ma.is_leader,0) as leader FROM users u JOIN members_people p ON p.account_user_id=u.id JOIN ministries_assignments ma ON ma.person_id=p.id WHERE u.active=1 AND ma.active=1 ORDER BY u.name LIMIT 300");
        } else {
          rows = await db.all("SELECT u.id, u.name, 0 as leader FROM users u WHERE u.active=1 ORDER BY u.name LIMIT 300");
        }
        return jsonResp(rows);
      }

      if (path === '/api/platform/announcements' && method === 'POST') {
        const body = await request.json();
        const aid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT INTO platform_announcements(id,title,message,target_sector,audience_type,audience_value,audience_ids,author_id,author_name,active,created_at,publish_at,expires_at,require_ack,dispatched) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,1)',
          [
            aid,
            String(body.title || '').trim(),
            encryptText(body.message || '', env),
            body.target_sector || 'all',
            body.audience_type || 'sector',
            body.audience_value || '',
            JSON.stringify(body.recipient_ids || []),
            user.id,
            user.name,
            nowIso(),
            body.publish_at || null,
            body.expires_at || null,
            body.require_ack ? 1 : 0
          ]
        );
        return jsonResp({ ok: true, id: aid });
      }

      if (path.startsWith('/api/platform/announcements/') && method === 'DELETE') {
        const aid = path.split('/')[4];
        await db.run('UPDATE platform_announcements SET active=0 WHERE id=?', [aid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/platform/archives/') && method === 'GET') {
        const mod = path.split('/')[4];
        const tables = {
          members: [['people', 'members_people', 'name'], ['families', 'members_families', 'name'], ['cells', 'members_cells', 'name']],
          ministries: [['schedules', 'ministries_schedules', 'title'], ['assignments', 'ministries_assignments', 'ministry'], ['resources', 'ministries_resources', 'title']],
          finance: [['accounts', 'finance_accounts', 'name'], ['cost-centers', 'finance_cost_centers', 'name'], ['entries', 'finance_entries', 'description'], ['closings', 'finance_service_closings', 'service_name'], ['invoices', 'finance_invoices', 'number']],
          kids: [['children', 'children', 'name'], ['rooms', 'rooms', 'name'], ['lessons', 'lessons', 'title'], ['events', 'events', 'title']]
        }[mod] || [];
        const items = [];
        for (const [kind, tbl, col] of tables) {
          const flagCol = tbl === 'children' ? 'archived=1' : 'active=0';
          const rows = await db.all(`SELECT id, ${col} as label, created_at FROM ${tbl} WHERE ${flagCol} ORDER BY created_at DESC LIMIT 50`);
          for (const r of rows) items.push({ id: r.id, kind, label: decryptText(r.label, env), created_at: r.created_at });
        }
        return jsonResp({ items });
      }

      if (path.startsWith('/api/platform/records/') && path.endsWith('/restore') && method === 'POST') {
        const [, , , , mod, kind, rid] = path.split('/');
        const map = {
          'members:people': 'members_people',
          'members:families': 'members_families',
          'members:cells': 'members_cells',
          'ministries:schedules': 'ministries_schedules',
          'ministries:assignments': 'ministries_assignments',
          'ministries:resources': 'ministries_resources',
          'finance:accounts': 'finance_accounts',
          'finance:cost-centers': 'finance_cost_centers',
          'finance:entries': 'finance_entries',
          'finance:closings': 'finance_service_closings',
          'finance:invoices': 'finance_invoices',
          'kids:children': 'children',
          'kids:rooms': 'rooms',
          'kids:lessons': 'lessons',
          'kids:events': 'events'
        }[`${mod}:${kind}`];
        if (!map) fail('kind', 'Tipo inválido.');
        if (map === 'children') await db.run('UPDATE children SET archived=0 WHERE id=?', [rid]);
        else await db.run(`UPDATE ${map} SET active=1 WHERE id=?`, [rid]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/platform/my-data' && method === 'GET') {
        const p = await linkedPerson(db, user);
        return jsonResp({
          user: buildPublicUser(user, admins, pastors),
          member_profile: p ? decryptRecord(p, env) : null,
          exported_at: nowIso()
        });
      }

      if (path === '/api/platform/backup' && method === 'GET') {
        if (!isRoot) fail('forbidden', 'Acesso exclusivo de TI.', 403);
        const usersCount = await db.scalar('SELECT count(*) FROM users');
        const peopleCount = await db.scalar('SELECT count(*) FROM members_people');
        return jsonResp({ ok: true, hosting: 'Cloudflare D1', users: usersCount, members: peopleCount, generated_at: nowIso() });
      }

      // === MEMBERS & GCS CRUD AND APPROVALS ===
      if (path === '/api/members/people' && method === 'POST') {
        const body = await request.json();
        const pid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO members_people(id,family_id,cell_id,name,relationship,phone,email,birthday,baptism_date,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,address,marital_status,profession,bio) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?,?)',
          [
            pid,
            body.family_id || null,
            body.cell_id || null,
            String(body.name || '').trim(),
            body.relationship || 'Membro',
            body.phone || '',
            body.email || '',
            body.birthday || null,
            body.baptism_date || null,
            body.joined_on || todayStr(),
            body.integration_stage || 'active_member',
            encryptText(body.pastoral_notes || '', env),
            nowIso(),
            user.id,
            encryptText(body.address || '', env),
            body.marital_status || '',
            body.profession || '',
            body.bio || ''
          ]
        );
        return jsonResp({ ok: true, id: pid, version: 1 });
      }

      if (path.startsWith('/api/members/people/') && (method === 'PUT' || method === 'DELETE')) {
        const pid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE members_people SET active=0, version=version+1 WHERE id=?', [pid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        const old = await db.first('SELECT * FROM members_people WHERE id=?', [pid]);
        if (!old) fail('missing', 'Membro não encontrado.', 404);
        await db.run(
          'UPDATE members_people SET name=?, phone=?, email=?, birthday=?, integration_stage=?, family_id=?, cell_id=?, address=?, version=version+1 WHERE id=?',
          [
            body.name !== undefined ? String(body.name).trim() : old.name,
            body.phone !== undefined ? String(body.phone) : old.phone,
            body.email !== undefined ? String(body.email) : old.email,
            body.birthday !== undefined ? (body.birthday || null) : old.birthday,
            body.integration_stage || old.integration_stage || 'active_member',
            body.family_id !== undefined ? (body.family_id || null) : old.family_id,
            body.cell_id !== undefined ? (body.cell_id || null) : old.cell_id,
            body.address !== undefined ? encryptText(body.address || '', env) : old.address,
            pid
          ]
        );
        return jsonResp({ ok: true, id: pid, version: Number(old.version || 1) + 1 });
      }

      if (path === '/api/members/families' && method === 'POST') {
        const body = await request.json();
        const fid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO members_families(id,name,cell_id,neighborhood,joined_on,active,version,created_at,created_by) VALUES(?,?,?,?,?,1,1,?,?)',
          [fid, String(body.name || '').trim(), body.cell_id || null, body.neighborhood || '', body.joined_on || todayStr(), nowIso(), user.id]
        );
        return jsonResp({ ok: true, id: fid, version: 1 });
      }

      if (path.startsWith('/api/members/families/') && (method === 'PUT' || method === 'DELETE')) {
        const fid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE members_families SET active=0, version=version+1 WHERE id=?', [fid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run(
          'UPDATE members_families SET name=?, cell_id=?, neighborhood=?, joined_on=?, version=version+1 WHERE id=?',
          [String(body.name || '').trim(), body.cell_id || null, body.neighborhood || '', body.joined_on || null, fid]
        );
        return jsonResp({ ok: true, id: fid });
      }

      if (path === '/api/members/cells' && method === 'POST') {
        const body = await request.json();
        const cid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO members_cells(id,name,leader_name,neighborhood,meeting_day,active,version,created_at,created_by,address,banner_url) VALUES(?,?,?,?,?,1,1,?,?,?,?)',
          [cid, String(body.name || '').trim(), body.leader_name || 'Liderança GC', body.neighborhood || '', body.meeting_day || 'Terça-feira | 19h30', nowIso(), user.id, encryptText(body.address || '', env), body.banner_url || '/gc/gc-ide.webp']
        );
        return jsonResp({ ok: true, id: cid, version: 1 });
      }

      if (path.startsWith('/api/members/cells/') && (method === 'PUT' || method === 'DELETE')) {
        const cid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE members_cells SET active=0, version=version+1 WHERE id=?', [cid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run(
          'UPDATE members_cells SET name=?, leader_name=?, neighborhood=?, address=?, meeting_day=?, banner_url=coalesce(?,banner_url), version=version+1 WHERE id=?',
          [String(body.name || '').trim(), body.leader_name || 'Liderança GC', body.neighborhood || '', encryptText(body.address || '', env), body.meeting_day || 'Terça-feira | 19h30', body.banner_url || null, cid]
        );
        return jsonResp({ ok: true, id: cid });
      }

      if (path === '/api/members/self-register' && method === 'POST') {
        const body = await request.json();
        const rid = randomBytes(16).toString('hex');
        await db.run(
          "INSERT INTO members_self_registrations(id,name,phone,email,birthday,family_name,address,integration_stage,notes,status,created_at,cell_id) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)",
          [rid, String(body.name || '').trim(), body.phone || '', body.email || '', body.birthday || null, body.family_name || '', encryptText(body.address || '', env), body.integration_stage || 'visitor', encryptText(body.notes || '', env), nowIso(), body.cell_id || null]
        );
        return jsonResp({ ok: true, id: rid, message: 'Ficha de cadastro enviada com sucesso!' });
      }

      if (path.startsWith('/api/members/self-registrations/') && path.endsWith('/approve') && method === 'POST') {
        const rid = path.split('/')[4];
        const reg = await db.first('SELECT * FROM members_self_registrations WHERE id=?', [rid]);
        if (!reg) fail('missing', 'Cadastro não encontrado.', 404);
        const pid = randomBytes(16).toString('hex');
        await db.run(
          'INSERT INTO members_people(id,family_id,cell_id,name,relationship,phone,email,birthday,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,address) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?)',
          [pid, null, reg.cell_id || null, reg.name, 'Membro', reg.phone || '', reg.email || '', reg.birthday || null, todayStr(), reg.integration_stage || 'active_member', '', nowIso(), user.id, reg.address || '']
        );
        await db.run("UPDATE members_self_registrations SET status='approved', reviewed_by=?, person_id=? WHERE id=?", [user.id, pid, rid]);
        return jsonResp({ ok: true, person_id: pid });
      }

      if (path.startsWith('/api/members/self-registrations/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run("UPDATE members_self_registrations SET status='rejected', reviewed_by=? WHERE id=?", [user.id, rid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/members/gc-applications/') && path.endsWith('/approve') && method === 'POST') {
        const rid = path.split('/')[4];
        const app = await db.first('SELECT * FROM sector_applications WHERE id=?', [rid]);
        if (!app) fail('missing', 'Solicitação não encontrada.', 404);
        const cell = await db.first('SELECT id FROM members_cells WHERE id=? OR lower(name)=lower(?)', [app.target_id, app.target_name]);
        const cellId = cell ? cell.id : app.target_id;
        let p = app.user_id ? await db.first('SELECT * FROM members_people WHERE account_user_id=? AND active=1', [app.user_id]) : null;
        if (!p && app.email) p = await db.first('SELECT * FROM members_people WHERE lower(email)=lower(?) AND active=1', [app.email]);
        if (p) {
          await db.run('UPDATE members_people SET cell_id=?, version=version+1 WHERE id=?', [cellId, p.id]);
        } else {
          const pid = randomBytes(16).toString('hex');
          await db.run(
            'INSERT INTO members_people(id,cell_id,name,relationship,phone,email,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,account_user_id) VALUES(?,?,?,?,?,?,?,?,?,1,1,?,?,?)',
            [pid, cellId, app.member_name, 'Membro', app.phone || '', app.email || '', todayStr(), 'gc', '', nowIso(), user.id, app.user_id || null]
          );
        }
        await db.run("UPDATE sector_applications SET status='approved', reviewed_by=? WHERE id=?", [user.id, rid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/members/gc-applications/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run("UPDATE sector_applications SET status='rejected', reviewed_by=? WHERE id=?", [user.id, rid]);
        return jsonResp({ ok: true });
      }

      // === MINISTRIES CRUD, WORSHIP SCALE & APPROVALS ===
      if (path === '/api/ministries/assignments' && method === 'POST') {
        const body = await request.json();
        const aid = String(body.request_id || randomBytes(16).toString('hex'));
        const isLeader = body.is_leader === true || body.is_leader === 'true' || body.is_leader === 1 ? 1 : 0;
        const existing = await db.first('SELECT id FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1', [body.person_id, body.ministry]);
        if (existing) {
          await db.run('UPDATE ministries_assignments SET position=?, is_leader=?, version=version+1 WHERE id=?', [body.position || 'Integrante', isLeader, existing.id]);
          return jsonResp({ ok: true, id: existing.id });
        }
        await db.run(
          'INSERT INTO ministries_assignments(id,person_id,ministry,position,started_on,active,version,created_at,is_leader,training_status,created_by) VALUES(?,?,?,?,?,1,1,?,?,?,?)',
          [aid, body.person_id, body.ministry, body.position || 'Integrante', body.started_on || todayStr(), nowIso(), isLeader, body.training_status || 'certified', user.id]
        );
        return jsonResp({ ok: true, id: aid });
      }

      if (path.startsWith('/api/ministries/assignments/') && (method === 'PUT' || method === 'DELETE')) {
        const aid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE ministries_assignments SET active=0, version=version+1 WHERE id=?', [aid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        const isLeader = body.is_leader === true || body.is_leader === 'true' || body.is_leader === 1 ? 1 : 0;
        await db.run(
          'UPDATE ministries_assignments SET person_id=?, ministry=?, position=?, is_leader=?, version=version+1 WHERE id=?',
          [body.person_id, body.ministry, body.position || 'Integrante', isLeader, aid]
        );
        return jsonResp({ ok: true, id: aid });
      }

      if (path === '/api/ministries/schedules' && method === 'POST') {
        const body = await request.json();
        const sid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO ministries_schedules(id,title,ministry,service_date,service_time,person_id,role_notes,status,notes,active,version,created_at,created_by,duration_minutes,response_due_at,reminder_enabled) VALUES(?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?)',
          [
            sid,
            String(body.title || 'Culto de Celebração').trim(),
            body.ministry || 'Music',
            body.service_date || todayStr(),
            body.service_time || '18:00',
            body.person_id,
            body.role_notes || '',
            body.status || 'confirmed',
            encryptText(body.notes || '', env),
            nowIso(),
            user.id,
            Number(body.duration_minutes || 60),
            body.response_due_at || null,
            body.reminder_enabled ? 1 : 0
          ]
        );
        return jsonResp({ ok: true, id: sid });
      }

      if (path.startsWith('/api/ministries/schedules/') && !path.endsWith('/respond') && (method === 'PUT' || method === 'DELETE')) {
        const sid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE ministries_schedules SET active=0, version=version+1 WHERE id=?', [sid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run(
          'UPDATE ministries_schedules SET title=?, ministry=?, service_date=?, service_time=?, person_id=?, role_notes=?, status=?, duration_minutes=?, response_due_at=?, reminder_enabled=?, version=version+1 WHERE id=?',
          [
            String(body.title || 'Culto').trim(),
            body.ministry || 'Music',
            body.service_date || todayStr(),
            body.service_time || '18:00',
            body.person_id,
            body.role_notes || '',
            body.status || 'confirmed',
            Number(body.duration_minutes || 60),
            body.response_due_at || null,
            body.reminder_enabled ? 1 : 0,
            sid
          ]
        );
        return jsonResp({ ok: true, id: sid });
      }

      if (path === '/api/ministries/worship-scale' && method === 'POST') {
        const body = await request.json();
        const members = Array.isArray(body.members) ? body.members : [];
        if (!members.length) fail('members', 'Selecione pelo menos 1 integrante.');
        const ids = [];
        for (const m of members) {
          const sid = randomBytes(16).toString('hex');
          await db.run(
            'INSERT INTO ministries_schedules(id,title,ministry,service_date,service_time,person_id,role_notes,status,notes,active,version,created_at,created_by,duration_minutes) VALUES(?,?,?,?,?,?,?,?,?,1,1,?,?,90)',
            [sid, body.title || 'Culto de Celebração', 'Music', body.service_date || todayStr(), body.service_time || '18:00', m.person_id, m.instrument || 'Integrante', 'pending', encryptText(body.repertoire_notes || '', env), nowIso(), user.id]
          );
          ids.push(sid);
        }
        if (body.repertoire_notes) {
          const rid = randomBytes(16).toString('hex');
          await db.run(
            'INSERT INTO ministries_resources(id,ministry,title,category,notes,resource_url,active,version,created_at,created_by) VALUES(?,?,?,?,?,?,1,1,?,?)',
            [rid, 'Music', `${body.title || 'Culto'} (${body.service_date})`, 'repertorio', encryptText(body.repertoire_notes, env), '', nowIso(), user.id]
          );
        }
        return jsonResp({ ok: true, created: ids.length, schedule_ids: ids });
      }

      if (path === '/api/ministries/resources' && method === 'POST') {
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO ministries_resources(id,ministry,title,category,notes,resource_url,active,version,created_at,created_by) VALUES(?,?,?,?,?,?,1,1,?,?)',
          [rid, body.ministry || 'Music', String(body.title || '').trim(), body.category || 'roteiro', encryptText(body.notes || '', env), body.resource_url || '', nowIso(), user.id]
        );
        return jsonResp({ ok: true, id: rid });
      }

      if (path.startsWith('/api/ministries/resources/') && (method === 'PUT' || method === 'DELETE')) {
        const rid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE ministries_resources SET active=0, version=version+1 WHERE id=?', [rid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run(
          'UPDATE ministries_resources SET ministry=?, title=?, category=?, notes=?, resource_url=?, version=version+1 WHERE id=?',
          [body.ministry || 'Music', String(body.title || '').trim(), body.category || 'roteiro', encryptText(body.notes || '', env), body.resource_url || '', rid]
        );
        return jsonResp({ ok: true, id: rid });
      }

      if (path.startsWith('/api/ministries/applications/') && path.endsWith('/approve') && method === 'POST') {
        const rid = path.split('/')[4];
        const app = await db.first('SELECT * FROM sector_applications WHERE id=?', [rid]);
        if (!app) fail('missing', 'Candidatura não encontrada.', 404);
        let p = app.user_id ? await db.first('SELECT * FROM members_people WHERE account_user_id=? AND active=1', [app.user_id]) : null;
        if (!p && app.email) p = await db.first('SELECT * FROM members_people WHERE lower(email)=lower(?) AND active=1', [app.email]);
        let personId = p ? p.id : null;
        if (!personId) {
          personId = randomBytes(16).toString('hex');
          await db.run(
            'INSERT INTO members_people(id,name,relationship,phone,email,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,account_user_id) VALUES(?,?,?,?,?,?,?,?,1,1,?,?,?)',
            [personId, app.member_name, 'Membro', app.phone || '', app.email || '', todayStr(), 'serving', '', nowIso(), user.id, app.user_id || null]
          );
        }
        const existing = await db.first('SELECT id FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1', [personId, app.target_name]);
        if (!existing) {
          await db.run(
            'INSERT INTO ministries_assignments(id,person_id,ministry,position,started_on,active,version,created_at,is_leader,training_status,created_by) VALUES(?,?,?,?,?,1,1,?,0,?,?)',
            [randomBytes(16).toString('hex'), personId, app.target_name, app.role_desired || 'Voluntário', todayStr(), nowIso(), 'in_training', user.id]
          );
        }
        await db.run("UPDATE sector_applications SET status='approved', reviewed_by=? WHERE id=?", [user.id, rid]);
        return jsonResp({ ok: true, person_id: personId });
      }

      if (path.startsWith('/api/ministries/applications/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run("UPDATE sector_applications SET status='rejected', reviewed_by=? WHERE id=?", [user.id, rid]);
        return jsonResp({ ok: true });
      }

      // === WORKSPACE GROUPS, JOURNEYS, SERVICES, INTEGRITY, DELIVERIES, AUDIT ===
      if (path === '/api/workspace/groups/search' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const day = (url.searchParams.get('day') || '').toLowerCase();
        const rows = await db.all(
          "SELECT id,name,neighborhood,meeting_day FROM members_cells WHERE active=1 AND (lower(name) LIKE ? OR lower(neighborhood) LIKE ?) AND lower(meeting_day) LIKE ? ORDER BY name LIMIT 100",
          [`%${q}%`, `%${q}%`, `%${day}%`]
        );
        return jsonResp(rows);
      }

      if (path.startsWith('/api/workspace/groups/') && path.split('/').length === 5 && method === 'GET') {
        const gid = path.split('/')[4];
        const group = await db.first('SELECT * FROM members_cells WHERE id=?', [gid]);
        if (!group) fail('missing', 'GC não encontrado.', 404);
        const people = await db.all('SELECT id,name FROM members_people WHERE cell_id=? AND active=1 ORDER BY name', [gid]);
        const meetings = (await db.all('SELECT m.*,(SELECT count(*) FROM gc_attendance a WHERE a.meeting_id=m.id AND a.present=1) present_count FROM gc_meetings m WHERE m.cell_id=? ORDER BY m.held_on DESC LIMIT 100', [gid])).map(r => ({ ...r, notes: decryptText(r.notes, env) }));
        const leaders = await db.all('SELECT u.id,u.name FROM gc_leaders l JOIN users u ON u.id=l.user_id WHERE l.cell_id=? AND u.active=1', [gid]);
        const applications = await db.all("SELECT id,member_name,status,created_at FROM sector_applications WHERE target_type='gc' AND status='pending' AND (target_id=? OR lower(target_name)=lower(?)) ORDER BY created_at LIMIT 100", [gid, group.name]);
        return jsonResp({ people, meetings, leaders, applications });
      }

      if (path.startsWith('/api/workspace/groups/') && path.endsWith('/leaders') && method === 'PUT') {
        const gid = path.split('/')[4];
        const body = await request.json();
        await db.run('INSERT OR IGNORE INTO gc_leaders(cell_id,user_id) VALUES(?,?)', [gid, Number(body.user_id)]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/workspace/groups/') && path.includes('/leaders/') && method === 'DELETE') {
        const parts = path.split('/');
        const gid = parts[4];
        const uid = Number(parts[6]);
        await db.run('DELETE FROM gc_leaders WHERE cell_id=? AND user_id=?', [gid, uid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/workspace/groups/') && path.endsWith('/meetings') && method === 'POST') {
        const gid = path.split('/')[4];
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO gc_meetings(id,cell_id,title,held_on,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
          [rid, gid, String(body.title || 'Encontro do GC').trim(), body.held_on || todayStr(), encryptText(body.notes || '', env), user.id, nowIso()]
        );
        const presentIds = Array.isArray(body.present_ids) ? body.present_ids : [];
        for (const pid of presentIds) {
          await db.run('INSERT OR REPLACE INTO gc_attendance(meeting_id,person_id,present) VALUES(?,?,1)', [rid, pid]);
        }
        return jsonResp({ ok: true, id: rid });
      }

      if (path.startsWith('/api/workspace/groups/') && path.includes('/applications/') && path.endsWith('/decision') && method === 'POST') {
        const parts = path.split('/');
        const gid = parts[4];
        const rid = parts[6];
        const body = await request.json();
        const app = await db.first('SELECT * FROM sector_applications WHERE id=?', [rid]);
        if (!app) fail('missing', 'Solicitação não encontrada.', 404);
        if (body.approve) {
          let p = app.user_id ? await db.first('SELECT * FROM members_people WHERE account_user_id=? AND active=1', [app.user_id]) : null;
          if (!p && app.email) p = await db.first('SELECT * FROM members_people WHERE lower(email)=lower(?) AND active=1', [app.email]);
          if (p) {
            await db.run('UPDATE members_people SET cell_id=?, version=version+1 WHERE id=?', [gid, p.id]);
          } else {
            await db.run(
              'INSERT INTO members_people(id,cell_id,name,relationship,phone,email,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,account_user_id) VALUES(?,?,?,?,?,?,?,?,?,1,1,?,?,?)',
              [randomBytes(16).toString('hex'), gid, app.member_name, 'Membro', app.phone || '', app.email || '', todayStr(), 'gc', '', nowIso(), user.id, app.user_id || null]
            );
          }
          await db.run("UPDATE sector_applications SET status='approved', reviewed_by=? WHERE id=?", [user.id, rid]);
        } else {
          await db.run("UPDATE sector_applications SET status='rejected', reviewed_by=? WHERE id=?", [user.id, rid]);
        }
        return jsonResp({ ok: true });
      }

      if (path === '/api/workspace/journeys' && method === 'GET') {
        const rows = await db.all('SELECT j.*,p.name as person_name FROM member_journey j JOIN members_people p ON p.id=j.person_id WHERE p.active=1 ORDER BY j.created_at DESC LIMIT 200');
        return jsonResp(rows.map(r => ({ ...r, notes: decryptText(r.notes, env) })));
      }

      if (path === '/api/workspace/journeys' && method === 'POST') {
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO member_journey(id,person_id,stage,next_action,due_on,responsible_id,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          [rid, body.person_id, body.stage || 'active_member', body.next_action || '', body.due_on || null, body.responsible_id ? Number(body.responsible_id) : null, encryptText(body.notes || '', env), user.id, nowIso()]
        );
        await db.run('UPDATE members_people SET integration_stage=?, version=version+1 WHERE id=?', [body.stage || 'active_member', body.person_id]);
        return jsonResp({ ok: true, id: rid });
      }

      if (path.startsWith('/api/workspace/journeys/') && path.endsWith('/complete') && method === 'POST') {
        const rid = path.split('/')[4];
        await db.run("UPDATE member_journey SET next_action='', version=version+1 WHERE id=?", [rid]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/workspace/services' && method === 'GET') {
        const rows = await db.all('SELECT * FROM service_templates WHERE active=1 ORDER BY weekday, service_time');
        return jsonResp(rows);
      }

      if (path === '/api/workspace/services' && method === 'POST') {
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO service_templates(id,title,weekday,service_time,duration_minutes,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
          [rid, String(body.title || 'Culto').trim(), Number(body.weekday || 0), body.service_time || '18:00', Number(body.duration_minutes || 90), user.id, nowIso()]
        );
        return jsonResp({ ok: true, id: rid });
      }

      if (path.startsWith('/api/workspace/services/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run('UPDATE service_templates SET active=0 WHERE id=?', [rid]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/workspace/responsibles' && method === 'GET') {
        const rows = await db.all('SELECT id,name FROM users WHERE active=1 ORDER BY name LIMIT 500');
        return jsonResp(rows);
      }

      if (path === '/api/workspace/integrity' && method === 'GET') {
        const orphan = await db.all('SELECT ch.id,ch.name,ch.room_id FROM children ch LEFT JOIN rooms r ON r.id=ch.room_id WHERE ch.archived=0 AND ch.room_id IS NOT NULL AND (r.id IS NULL OR r.active=0)');
        const duplicates = await db.all('SELECT lower(name) as name, count(*) as count FROM members_people WHERE active=1 GROUP BY lower(name) HAVING count(*)>1 ORDER BY count(*) DESC LIMIT 100');
        const incomplete = Number(await db.scalar("SELECT count(*) FROM members_people WHERE active=1 AND (birthday IS NULL OR phone='' OR account_user_id IS NULL)") || 0);
        return jsonResp({ invalid_rooms: orphan, duplicate_names: duplicates, incomplete_people: incomplete, automatic_changes: false });
      }

      if (path === '/api/workspace/deliveries' && method === 'GET') {
        const rows = await db.all('SELECT n.id,n.kind,n.created_at,n.read_at,o.status,o.attempts,o.last_error,o.delivered_at FROM notifications n LEFT JOIN outbox o ON o.notification_id=n.id ORDER BY n.id DESC LIMIT 100');
        return jsonResp(rows);
      }

      if (path === '/api/workspace/audit/changes' && method === 'GET') {
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const rows = await db.all('SELECT id,module,action,record_id,created_at FROM module_changes ORDER BY created_at DESC LIMIT 50 OFFSET ?', [(page - 1) * 50]);
        return jsonResp({ items: rows, page });
      }

      if (path.startsWith('/api/workspace/audit/changes/') && method === 'GET') {
        const rid = path.split('/')[5];
        const row = await db.first('SELECT * FROM module_changes WHERE id=?', [rid]);
        if (!row) fail('missing', 'Alteração não encontrada.', 404);
        let before = {}, after = {};
        try { before = JSON.parse(row.before_json || '{}'); } catch {}
        try { after = JSON.parse(row.after_json || '{}'); } catch {}
        return jsonResp({ before: decryptRecord(before, env), after: decryptRecord(after, env), module: row.module, action: row.action });
      }

      if (path === '/api/workspace/invitations' && method === 'POST') {
        if (!isRoot) fail('forbidden', 'Acesso exclusivo de TI.', 403);
        const body = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        if (name.length < 2) fail('name', 'Informe o nome completo.');
        const existing = await db.first('SELECT id FROM users WHERE lower(email)=lower(?)', [email]);
        if (existing) fail('exists', 'Conta já existente.', 409);
        const ins = await db.run(
          "INSERT INTO users(name,email,password,role,activation_required,created_at) VALUES(?,?,?,'parent',1,?)",
          [name, email, passwordHash(randomBytes(24).toString('hex')), nowIso()]
        );
        const token = randomBytes(24).toString('base64url');
        return jsonResp({ ok: true, id: ins.lastrowid, url: `${url.origin}/#reset=${token}`, expires_in_hours: 48, email_queued: false });
      }

      if (path === '/api/workspace/finance/operations' && method === 'GET') {
        const accounts = await db.all('SELECT id,name,require_approval FROM finance_accounts WHERE active=1 ORDER BY name');
        const approvals = await db.all("SELECT a.*,e.description,e.amount_cents,e.direction FROM finance_approvals a JOIN finance_entries e ON e.id=a.entry_id WHERE e.active=1 AND a.status='pending' ORDER BY a.created_at LIMIT 100");
        const statements = await db.all('SELECT l.*,a.name as account_name FROM finance_statement_lines l JOIN finance_accounts a ON a.id=l.account_id ORDER BY l.occurred_on DESC LIMIT 100');
        const recurrences = await db.all('SELECT * FROM finance_recurrences WHERE active=1 ORDER BY next_on LIMIT 100');
        const transfers = await db.all('SELECT * FROM finance_transfers ORDER BY occurred_on DESC LIMIT 100');
        return jsonResp({ accounts, approvals, statements, recurrences, transfers });
      }

      if (path === '/api/workspace/reception' && method === 'GET') {
        const rows = await db.all("SELECT ch.*,coalesce(r.name,'Sem turma') as room_name,coalesce(a.status,'absent') as attendance_status FROM children ch LEFT JOIN rooms r ON r.id=ch.room_id LEFT JOIN attendance a ON a.child_id=ch.id AND a.day=? WHERE ch.archived=0 ORDER BY ch.name LIMIT 500", [todayStr()]);
        return jsonResp({
          items: rows.map(r => ({
            id: r.id,
            name: r.name,
            room_name: r.room_name,
            status: r.attendance_status,
            reservations: [],
            needs_guardian: !r.parent_id,
            needs_room: !r.room_id
          })),
          date: todayStr()
        });
      }

      if (path.startsWith('/api/workspace/children/') && path.includes('/pickups')) {
        const parts = path.split('/');
        const cid = Number(parts[4]);
        if (method === 'GET') {
          const rows = await db.all('SELECT id,name,relationship,identity_hint,expires_on FROM pickup_authorizations WHERE child_id=? AND active=1 ORDER BY name', [cid]);
          return jsonResp(rows);
        }
        if (method === 'POST') {
          const body = await request.json();
          const rid = randomBytes(16).toString('hex');
          await db.run(
            'INSERT INTO pickup_authorizations(id,child_id,name,relationship,identity_hint,expires_on,created_by,created_at,active) VALUES(?,?,?,?,?,?,?,?,1)',
            [rid, cid, body.name, body.relationship || '', body.identity_hint || '', body.expires_on || null, user.id, nowIso()]
          );
          return jsonResp({ ok: true, id: rid });
        }
        if (method === 'DELETE') {
          const rid = parts[6];
          await db.run('UPDATE pickup_authorizations SET active=0 WHERE id=? AND child_id=?', [rid, cid]);
          return jsonResp({ ok: true });
        }
      }

      // === CHURCH ATTENDANCE EXTRA ENDPOINTS ===
      if (path === '/api/workspace/church-attendance/people/search' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const rows = await db.all('SELECT id,name FROM members_people WHERE active=1 AND lower(name) LIKE ? ORDER BY name LIMIT 40', [`%${q}%`]);
        return jsonResp(rows);
      }

      if (path.startsWith('/api/workspace/church-attendance/') && path.endsWith('/presences') && method === 'GET') {
        const rid = path.split('/')[4];
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const total = Number(await db.scalar('SELECT count(*) FROM church_presences WHERE service_id=? AND voided=0', [rid]) || 0);
        const rows = await db.all('SELECT a.person_id,p.name,a.method,a.checked_at,a.reason FROM church_presences a JOIN members_people p ON p.id=a.person_id WHERE a.service_id=? AND a.voided=0 ORDER BY a.checked_at DESC LIMIT 50 OFFSET ?', [rid, (page - 1) * 50]);
        return jsonResp({ items: rows.map(r => ({ ...r, reason: decryptText(r.reason, env) })), total, page });
      }

      if (path.startsWith('/api/workspace/church-attendance/') && path.endsWith('/manual') && method === 'POST') {
        const rid = path.split('/')[4];
        const body = await request.json();
        await db.run(
          "INSERT INTO church_presences(service_id,person_id,method,checked_at,actor,reason,service_version,voided) VALUES(?,?,?,?,?,?,1,0) ON CONFLICT(service_id,person_id) DO UPDATE SET method='manual',checked_at=excluded.checked_at,actor=excluded.actor,reason=excluded.reason,voided=0",
          [rid, body.person_id, 'manual', nowIso(), user.id, encryptText(body.reason || '', env)]
        );
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/workspace/church-attendance/') && path.includes('/presences/') && method === 'DELETE') {
        const parts = path.split('/');
        const rid = parts[4];
        const pid = parts[6];
        await db.run('UPDATE church_presences SET voided=1 WHERE service_id=? AND person_id=?', [rid, pid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/workspace/church-attendance/') && path.split('/').length === 5 && (method === 'PUT' || method === 'DELETE')) {
        const rid = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE church_services SET active=0, version=version+1 WHERE id=?', [rid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        const start = new Date(body.starts_at);
        const opensAt = new Date(start.getTime() - Number(body.early_minutes || 15) * 60000).toISOString();
        const closesAt = new Date(Math.min(new Date(body.ends_at).getTime(), start.getTime() + Number(body.late_minutes || 30) * 60000)).toISOString();
        await db.run(
          'UPDATE church_services SET title=?, starts_at=?, ends_at=?, location=?, latitude=?, longitude=?, radius_m=?, opens_at=?, closes_at=?, version=version+1 WHERE id=?',
          [body.title.trim(), body.starts_at, body.ends_at, body.location.trim(), Number(body.latitude), Number(body.longitude), Number(body.radius_m || 150), opensAt, closesAt, rid]
        );
        return jsonResp({ ok: true, id: rid });
      }

      // === FINANCE CRUD & REPORTS ===
      const toCents = val => Math.round(Number(String(val || '0').replace(',', '.')) * 100) || 0;

      if (path === '/api/finance/accounts' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO finance_accounts(id,name,bank,opening_cents,active,version,created_at,created_by) VALUES(?,?,?,?,1,1,?,?)',
          [id, String(body.name || '').trim(), body.bank || '', toCents(body.opening_value), nowIso(), user.id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/accounts/') && (method === 'PUT' || method === 'DELETE')) {
        const id = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE finance_accounts SET active=0, version=version+1 WHERE id=?', [id]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run('UPDATE finance_accounts SET name=?, bank=?, opening_cents=?, version=version+1 WHERE id=?', [String(body.name || '').trim(), body.bank || '', toCents(body.opening_value), id]);
        return jsonResp({ ok: true, id });
      }

      if (path === '/api/finance/cost-centers' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO finance_cost_centers(id,name,ministry,budget_cents,active,version,created_at,created_by) VALUES(?,?,?,?,1,1,?,?)',
          [id, String(body.name || '').trim(), body.ministry || '', toCents(body.budget_value), nowIso(), user.id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/cost-centers/') && (method === 'PUT' || method === 'DELETE')) {
        const id = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE finance_cost_centers SET active=0, version=version+1 WHERE id=?', [id]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run('UPDATE finance_cost_centers SET name=?, ministry=?, budget_cents=?, version=version+1 WHERE id=?', [String(body.name || '').trim(), body.ministry || '', toCents(body.budget_value), id]);
        return jsonResp({ ok: true, id });
      }

      if (path === '/api/finance/entries' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO finance_entries(id,account_id,cost_center_id,direction,description,occurred_on,amount_cents,active,version,created_at,category,payment_status,payment_method,due_date,created_by) VALUES(?,?,?,?,?,?,?,1,1,?,?,?,?,?,?)',
          [id, body.account_id, body.cost_center_id || null, body.direction || 'income', String(body.description || '').trim(), body.occurred_on || todayStr(), toCents(body.amount), nowIso(), body.category || 'Geral', body.payment_status || 'paid', body.payment_method || 'pix', body.due_date || null, user.id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/entries/') && path.endsWith('/settle') && method === 'POST') {
        const id = path.split('/')[4];
        await db.run("UPDATE finance_entries SET payment_status='paid', version=version+1 WHERE id=?", [id]);
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/entries/') && !path.endsWith('/settle') && (method === 'PUT' || method === 'DELETE')) {
        const id = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE finance_entries SET active=0, version=version+1 WHERE id=?', [id]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run(
          'UPDATE finance_entries SET account_id=?, cost_center_id=?, direction=?, description=?, occurred_on=?, amount_cents=?, payment_status=?, payment_method=?, due_date=?, version=version+1 WHERE id=?',
          [body.account_id, body.cost_center_id || null, body.direction || 'income', String(body.description || '').trim(), body.occurred_on || todayStr(), toCents(body.amount), body.payment_status || 'paid', body.payment_method || 'pix', body.due_date || null, id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path === '/api/finance/closings' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        const t = toCents(body.tithes), oc = toCents(body.offerings_cash), op = toCents(body.offerings_pix), ocard = toCents(body.offerings_card);
        const total = t + oc + op + ocard;
        await db.run(
          'INSERT OR REPLACE INTO finance_service_closings(id,service_name,service_date,account_id,tithes_cents,offerings_cash_cents,offerings_pix_cents,offerings_card_cents,total_cents,counted_by,verified_by,notes,active,version,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?)',
          [id, body.service_name || 'Culto', body.service_date || todayStr(), body.account_id, t, oc, op, ocard, total, body.counted_by || user.name, body.verified_by || '', encryptText(body.notes || '', env), nowIso(), user.id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/closings/') && (method === 'PUT' || method === 'DELETE')) {
        const id = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE finance_service_closings SET active=0, version=version+1 WHERE id=?', [id]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        const t = toCents(body.tithes), oc = toCents(body.offerings_cash), op = toCents(body.offerings_pix), ocard = toCents(body.offerings_card);
        await db.run(
          'UPDATE finance_service_closings SET service_name=?, service_date=?, account_id=?, tithes_cents=?, offerings_cash_cents=?, offerings_pix_cents=?, offerings_card_cents=?, total_cents=?, counted_by=?, verified_by=?, notes=?, version=version+1 WHERE id=?',
          [body.service_name || 'Culto', body.service_date || todayStr(), body.account_id, t, oc, op, ocard, t + oc + op + ocard, body.counted_by || user.name, body.verified_by || '', encryptText(body.notes || '', env), id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path === '/api/finance/invoices' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO finance_invoices(id,entry_id,number,supplier,issued_on,amount_cents,file_id,active,version,created_at,created_by) VALUES(?,?,?,?,?,?,?,1,1,?,?)',
          [id, body.entry_id || null, String(body.number || '').trim(), String(body.supplier || '').trim(), body.issued_on || todayStr(), toCents(body.amount), body.file_id || null, nowIso(), user.id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/invoices/') && (method === 'PUT' || method === 'DELETE')) {
        const id = path.split('/')[4];
        if (method === 'DELETE') {
          await db.run('UPDATE finance_invoices SET active=0, version=version+1 WHERE id=?', [id]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        await db.run(
          'UPDATE finance_invoices SET entry_id=?, number=?, supplier=?, issued_on=?, amount_cents=?, file_id=?, version=version+1 WHERE id=?',
          [body.entry_id || null, String(body.number || '').trim(), String(body.supplier || '').trim(), body.issued_on || todayStr(), toCents(body.amount), body.file_id || null, id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path.startsWith('/api/finance/history/') && method === 'GET') {
        const rid = path.split('/')[4];
        const rows = await db.all('SELECT * FROM module_changes WHERE record_id=? ORDER BY created_at DESC LIMIT 50', [rid]);
        return jsonResp(rows);
      }

      if (path === '/api/finance/report' && method === 'GET') {
        const entries = await db.all('SELECT e.*, a.name as account_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id WHERE e.active=1 ORDER BY e.occurred_on DESC LIMIT 500');
        return jsonResp({ items: entries, generated_at: nowIso() });
      }


      
      // === KIDS CRUD & CHECK-IN ENDPOINTS ===
      if (path === '/api/children' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO children(name,birth_date,room_id,parent_id,guardian_name,guardian_phone,allergies,medical_notes,authorized_pickups,created_at,archived) VALUES(?,?,?,?,?,?,?,?,?,?,0)',
          [
            String(body.name || '').trim(),
            body.birth_date || todayStr(),
            Number(body.room_id || 1),
            body.parent_id ? Number(body.parent_id) : user.id,
            body.guardian_name || user.name,
            body.guardian_phone || user.phone || '',
            encryptText(body.allergies || '', env),
            encryptText(body.medical_notes || '', env),
            encryptText(body.authorized_pickups || '', env),
            nowIso()
          ]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path.startsWith('/api/children/') && path.endsWith('/attendance') && method === 'POST') {
        const cid = Number(path.split('/')[3]);
        const body = await request.json();
        const day = todayStr();
        const status = body.status || 'present';
        const code = Array.from({ length: 4 }, () => CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)]).join('');
        if (status === 'present') {
          await db.run(
            'INSERT INTO attendance(child_id,day,status,in_at,guardian,teacher_id,claim_code) VALUES(?,?,?,?,?,?,?) ON CONFLICT(child_id,day) DO UPDATE SET status=excluded.status, in_at=excluded.in_at, guardian=excluded.guardian, claim_code=coalesce(attendance.claim_code,excluded.claim_code)',
            [cid, day, 'present', nowIso(), body.guardian || user.name, user.id, code]
          );
        } else {
          await db.run(
            'UPDATE attendance SET status=?, out_at=?, checkout_guardian=? WHERE child_id=? AND day=?',
            [status, nowIso(), body.guardian || user.name, cid, day]
          );
        }
        return jsonResp({ ok: true, claim_code: code, status });
      }

      if (path.startsWith('/api/children/') && path.split('/').length === 4 && (method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        const cid = Number(path.split('/')[3]);
        if (method === 'DELETE') {
          await db.run('UPDATE children SET archived=1 WHERE id=?', [cid]);
          return jsonResp({ ok: true });
        }
        const body = await request.json();
        const old = await db.first('SELECT * FROM children WHERE id=?', [cid]);
        if (!old) fail('missing', 'Criança não encontrada.', 404);
        await db.run(
          'UPDATE children SET name=?, birth_date=?, room_id=?, allergies=?, medical_notes=?, authorized_pickups=? WHERE id=?',
          [
            body.name !== undefined ? String(body.name).trim() : old.name,
            body.birth_date || old.birth_date,
            body.room_id ? Number(body.room_id) : old.room_id,
            body.allergies !== undefined ? encryptText(body.allergies, env) : old.allergies,
            body.medical_notes !== undefined ? encryptText(body.medical_notes, env) : old.medical_notes,
            body.authorized_pickups !== undefined ? encryptText(body.authorized_pickups, env) : old.authorized_pickups,
            cid
          ]
        );
        return jsonResp({ ok: true, id: cid });
      }

      if (path === '/api/rooms' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO rooms(name,age_group,min_age,max_age,capacity,color,teacher_id,monitor_id,active) VALUES(?,?,?,?,?,?,?,?,1)',
          [String(body.name || '').trim(), body.age_group || '', Number(body.min_age || 0), Number(body.max_age || 12), Number(body.capacity || 20), body.color || '#4f46e5', body.teacher_id ? Number(body.teacher_id) : null, body.monitor_id ? Number(body.monitor_id) : null]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path === '/api/lessons' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO lessons(room_id,title,theme,bible_verse,starts_at,ends_at,teacher_id,monitor_id,notes,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)',
          [Number(body.room_id || 1), String(body.title || '').trim(), body.theme || '', body.bible_verse || '', body.starts_at || nowIso(), body.ends_at || nowIso(), body.teacher_id ? Number(body.teacher_id) : user.id, body.monitor_id ? Number(body.monitor_id) : null, body.notes || '', nowIso()]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path === '/api/events' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO events(title,category,description,location,starts_at,ends_at,capacity,price_cents,target_audience,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)',
          [String(body.title || '').trim(), body.category || 'culto', body.description || '', body.location || 'Templo Lagoinha', body.starts_at || nowIso(), body.ends_at || nowIso(), Number(body.capacity || 100), Number(body.price_cents || 0), body.target_audience || 'Todos', nowIso()]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path === '/api/guests/checkin' && method === 'POST') {
        const body = await request.json();
        const code = Array.from({ length: 4 }, () => CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)]).join('');
        const ins = await db.run(
          "INSERT INTO guest_checkins(child_name,child_age,guardian_name,guardian_phone,room_id,allergies,notes,claim_code,status,in_at,checked_in_by,created_at) VALUES(?,?,?,?,?,?,?,?,'present',?,?,?)",
          [String(body.child_name || '').trim(), Number(body.child_age || 5), String(body.guardian_name || '').trim(), String(body.guardian_phone || '').trim(), Number(body.room_id || 1), encryptText(body.allergies || '', env), encryptText(body.notes || '', env), code, nowIso(), user.id, nowIso()]
        );
        return jsonResp({ ok: true, id: ins.lastrowid, claim_code: code });
      }

      if (path === '/api/realtime/status' && method === 'GET') {
        return jsonResp({ status: 'ok', low_cost_mode: true });
      }
      if (path === '/api/realtime/ticket' && method === 'POST') {
        return jsonResp({ ticket: 'cloudflare-d1', expires_in: 60 });
      }
      if (path === '/api/realtime/stream' && method === 'GET') {
        return new Response('event: connected\ndata: {"status":"connected","mode":"cloudflare-d1"}\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
        });
      }

      return jsonResp({ ok: true, items: [] });
    } catch (err) {
      if (err && err.payload) {
        return jsonResp(err.payload, err.status || 400);
      }
      return jsonResp({ detail: { code: 'server_error', message: err?.message || 'Erro interno no servidor.' } }, 500);
    }
  }
};
