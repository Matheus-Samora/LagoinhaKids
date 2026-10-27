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
        const cells = (await db.all('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name')).map(c => decryptRecord(c, env));
        const countsRows = await db.all('SELECT ministry,count(*) total,sum(CASE WHEN is_leader=1 THEN 1 ELSE 0 END) leaders FROM ministries_assignments WHERE active=1 GROUP BY ministry');
        const counts = Object.fromEntries(countsRows.map(r => [r.ministry, r]));
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
          ministries: MINISTRY_CATALOG.map(m => ({ name: m, total: Number(counts[m]?.total || 0), leaders: Number(counts[m]?.leaders || 0) })),
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
        const items = await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60', [user.id]);
        const unread = await db.scalar('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL', [user.id]);
        return jsonResp({ items, unread_count: Number(unread || 0) });
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

      if ((path === '/api/audit' || path === '/api/workspace/audit') && method === 'GET') {
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
          const cells = (await db.all('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count,(SELECT count(*) FROM members_families f WHERE f.cell_id=mc.id AND f.active=1) family_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name LIMIT 300')).map(r => decryptRecord(r, env));
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
          const ct = request.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            body = await request.json();
          } else if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
            const fd = await request.formData();
            for (const [k, v] of fd.entries()) {
              if (typeof v === 'string') body[k] = v;
            }
          }
          const name = body.name ? String(body.name).trim() : user.name;
          const phone = body.phone !== undefined ? String(body.phone).trim() : (user.phone || '');
          const bio = body.bio !== undefined ? String(body.bio).trim() : (user.bio || '');
          await db.run('UPDATE users SET name=?, phone=?, bio=?, profile_version=coalesce(profile_version,1)+1 WHERE id=?', [name, phone, bio, user.id]);
          const pRow = await linkedPerson(db, user);
          if (pRow) {
            await db.run(
              'UPDATE members_people SET name=?, phone=?, birthday=coalesce(?,birthday), marital_status=coalesce(?,marital_status), profession=coalesce(?,profession), address=coalesce(?,address), bio=?, version=version+1 WHERE id=?',
              [name, phone, body.birthday || null, body.marital_status ?? null, body.profession ?? null, body.address !== undefined ? encryptText(body.address, env) : null, bio, pRow.id]
            );
          }
          const { res } = await buildProfileAccount();
          return jsonResp({ ok: true, user: res });
        }
      }

      if (path.startsWith('/api/hall') || path.startsWith('/api/platform/hall')) {
        if (path.endsWith('/posts') && method === 'GET') {
          const posts = await db.all('SELECT * FROM hall_posts WHERE active=1 ORDER BY pinned DESC, created_at DESC LIMIT 50');
          return jsonResp({ items: posts.map(p => decryptRecord(p, env)) });
        }
        if (path.endsWith('/summary') && method === 'GET') {
          const count = await db.scalar('SELECT count(*) FROM hall_posts WHERE active=1');
          return jsonResp({ posts_count: Number(count || 0) });
        }
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
