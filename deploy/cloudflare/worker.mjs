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
  const effectiveRole = staffRole === 'monitor' ? 'monitor' : row.role;
  return {
    id: uid,
    name: row.name,
    email: row.email,
    role: effectiveRole,
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

async function canManageGC(db, user, cellId, isGlobal, isPastor) {
  if (isGlobal || isPastor) return true;
  const grant = await db.first("SELECT role FROM module_access WHERE user_id=? AND module='members' AND enabled=1", [user.id]);
  if (grant && (grant.role === 'admin' || grant.role === 'pastor')) return true;
  if (cellId) {
    const isLead = await db.first('SELECT 1 FROM gc_leaders WHERE cell_id=? AND user_id=?', [cellId, user.id]);
    if (isLead) return true;
    const isPersonLead = await db.first(
      "SELECT 1 FROM members_people WHERE cell_id=? AND (account_user_id=? OR lower(email)=lower(?)) AND gc_role='leader' AND active=1",
      [cellId, user.id, user.email]
    );
    if (isPersonLead) return true;
  }
  return false;
}

async function canManageMinistry(db, user, ministryName, isGlobal, isPastor) {
  if (isGlobal || isPastor) return true;
  const grant = await db.first("SELECT role FROM module_access WHERE user_id=? AND module='ministries' AND enabled=1", [user.id]);
  if (grant && (grant.role === 'admin' || grant.role === 'pastor')) return true;
  if (grant && grant.role === 'leader') {
    const scRow = await db.first("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'", [user.id]);
    let allowedScopes = [];
    try {
      if (scRow?.scope) allowedScopes = scRow.scope.startsWith('[') ? JSON.parse(scRow.scope) : [scRow.scope];
    } catch {}
    if (!allowedScopes.length || !ministryName || allowedScopes.includes(ministryName)) return true;
  }
  if (ministryName) {
    const isLead = await db.first(
      "SELECT 1 FROM ministries_assignments ma JOIN members_people p ON p.id=ma.person_id WHERE (p.account_user_id=? OR lower(p.email)=lower(?)) AND ma.ministry=? AND ma.is_leader=1 AND ma.active=1",
      [user.id, user.email, ministryName]
    );
    if (isLead) return true;
  }
  return false;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const a = toRad(lat1);
  const b = toRad(lat2);
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

async function fetchGeocode(q, env = {}) {
  const googleKey = env?.GOOGLE_MAPS_API_KEY || env?.GOOGLE_MAPS_KEY || '';
  if (googleKey) {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${googleKey}&language=pt-BR`;
      const res = await fetch(gUrl, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
        return data.results.map(r => {
          let neighborhood = '', city = '', state = '', road = '', number = '';
          for (const c of r.address_components || []) {
            if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
            if (c.types.includes('administrative_area_level_2')) city = c.long_name;
            if (c.types.includes('administrative_area_level_1')) state = c.short_name;
            if (c.types.includes('route')) road = c.long_name;
            if (c.types.includes('street_number')) number = c.long_name;
          }
          const regionParts = [neighborhood, city, state].filter(Boolean);
          return {
            provider: 'google',
            display_name: r.formatted_address,
            location_name: road ? (road + (number ? ', ' + number : '')) : (neighborhood || r.formatted_address.split(',')[0]),
            address: r.formatted_address,
            neighborhood,
            city,
            state,
            region_label: regionParts.join(', '),
            latitude: r.geometry.location.lat,
            longitude: r.geometry.location.lng
          };
        });
      }
    } catch (e) {
      console.warn('Google Geocode error:', e);
    }
  }

  try {
    const oUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&countrycodes=br&addressdetails=1`;
    const res = await fetch(oUrl, {
      headers: {
        'User-Agent': 'LagoinhaKidsAttendance/1.0 (contato@lagoinha.com)',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });
    const items = await res.json();
    if (Array.isArray(items)) {
      return items.map(item => {
        const addr = item.address || {};
        const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || addr.subdivision || '';
        const city = addr.city || addr.town || addr.municipality || addr.village || '';
        const state = addr.state || '';
        const road = addr.road || '';
        const number = addr.house_number || '';
        const regionParts = [neighborhood, city, state].filter(Boolean);
        return {
          provider: 'nominatim',
          display_name: item.display_name,
          location_name: item.name || (road ? (road + (number ? ', ' + number : '')) : item.display_name.split(',')[0]),
          address: item.display_name,
          neighborhood,
          city,
          state,
          region_label: regionParts.join(', '),
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon)
        };
      });
    }
  } catch (e) {
    console.warn('Nominatim error:', e);
  }
  return [];
}

async function fetchReverseGeocode(lat, lon, env = {}) {
  const googleKey = env?.GOOGLE_MAPS_API_KEY || env?.GOOGLE_MAPS_KEY || '';
  if (googleKey) {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${googleKey}&language=pt-BR`;
      const res = await fetch(gUrl, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
        const r = data.results[0];
        let neighborhood = '', city = '', state = '', road = '', number = '';
        for (const c of r.address_components || []) {
          if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1') || c.types.includes('neighborhood')) neighborhood = c.long_name;
          if (c.types.includes('administrative_area_level_2')) city = c.long_name;
          if (c.types.includes('administrative_area_level_1')) state = c.short_name;
          if (c.types.includes('route')) road = c.long_name;
          if (c.types.includes('street_number')) number = c.long_name;
        }
        const regionParts = [neighborhood, city, state].filter(Boolean);
        return {
          ok: true,
          provider: 'google',
          display_name: r.formatted_address,
          address: r.formatted_address,
          neighborhood,
          city,
          state,
          road,
          house_number: number,
          region_label: regionParts.join(', ') || r.formatted_address,
          latitude: Number(lat),
          longitude: Number(lon)
        };
      }
    } catch (e) {
      console.warn('Google Reverse Geocode error:', e);
    }
  }

  try {
    const oUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(oUrl, {
      headers: {
        'User-Agent': 'LagoinhaKidsAttendance/1.0 (contato@lagoinha.com)',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });
    const item = await res.json();
    if (item && item.address) {
      const addr = item.address;
      const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || addr.subdivision || '';
      const city = addr.city || addr.town || addr.municipality || addr.village || '';
      const state = addr.state || '';
      const road = addr.road || '';
      const number = addr.house_number || '';
      const regionParts = [neighborhood, city, state].filter(Boolean);
      return {
        ok: true,
        provider: 'nominatim',
        display_name: item.display_name,
        address: item.display_name,
        neighborhood,
        city,
        state,
        road,
        house_number: number,
        region_label: regionParts.join(', ') || item.display_name,
        latitude: Number(lat),
        longitude: Number(lon)
      };
    }
  } catch (e) {
    console.warn('Nominatim reverse error:', e);
  }

  return {
    ok: false,
    region_label: `Coordenadas: ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`,
    latitude: Number(lat),
    longitude: Number(lon)
  };
}


const CHURCH_LOCATION = {
  address: 'Rua José Otávio da Fonseca, 228, Vila Isa, Governador Valadares, Minas Gerais, 35044-170, Brasil',
  latitude: -18.888042,
  longitude: -41.947946,
  radius_m: 180
};

function parseBrasiliaDate(str) {
  if (!str) return new Date();
  if (typeof str !== 'string') return new Date(str);
  const trimmed = str.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return new Date(trimmed.length === 16 ? `${trimmed}:00-03:00` : `${trimmed}-03:00`);
  }
  return new Date(trimmed);
}

let lastChurchTemplateSync = 0;
async function syncChurchServicesFromTemplates(db, force = false) {
  const now = Date.now();
  if (!force && (now - lastChurchTemplateSync < 60000)) return;
  lastChurchTemplateSync = now;
  try {
    const templates = await db.all('SELECT * FROM service_templates WHERE active=1');
    if (!templates || !templates.length) return;

    const spNow = new Date(now - 3 * 3600 * 1000);
    const startDay = new Date(Date.UTC(spNow.getUTCFullYear(), spNow.getUTCMonth(), spNow.getUTCDate()));

    for (let dayOffset = -7; dayOffset <= 45; dayOffset++) {
      const tDate = new Date(startDay.getTime() + dayOffset * 86400000);
      const isoWeekday = (tDate.getUTCDay() + 6) % 7;
      const yyyy = tDate.getUTCFullYear();
      const mm = String(tDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(tDate.getUTCDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      for (const t of templates) {
        if (Number(t.weekday) === isoWeekday) {
          const hiddenList = (t.hidden_dates || '').split(',').map(s => s.trim()).filter(Boolean);
          const isHidden = hiddenList.includes(dateStr);
          const serviceId = `ca_${t.id.slice(0, 8)}_${dateStr.replace(/-/g, '')}`;

          if (isHidden) {
            await db.run('UPDATE church_services SET active=0 WHERE id=?', [serviceId]);
            continue;
          }

          const duration = Number(t.duration_minutes || 120);
          const startsAt = `${dateStr}T${t.service_time}:00-03:00`;
          const startTimeMs = new Date(startsAt).getTime();
          const endsAtMs = startTimeMs + duration * 60000;
          const startsAtIso = new Date(startTimeMs).toISOString();
          const endsAtIso = new Date(endsAtMs).toISOString();

          // Check-in opens 45 mins before and closes 30 mins after the service ends
          const opensAtIso = new Date(startTimeMs - 45 * 60000).toISOString();
          const closesAtIso = new Date(endsAtMs + 30 * 60000).toISOString();

          await db.run(
            `INSERT INTO church_services(id,title,starts_at,ends_at,location,latitude,longitude,radius_m,opens_at,closes_at,active,version,created_by,created_at)
             VALUES(?,?,?,?,?,?,?,?,?,1,1,NULL,?)
             ON CONFLICT(id) DO UPDATE SET
               title=excluded.title,
               starts_at=excluded.starts_at,
               ends_at=excluded.ends_at,
               location=excluded.location,
               latitude=excluded.latitude,
               longitude=excluded.longitude,
               radius_m=excluded.radius_m,
               opens_at=excluded.opens_at,
               closes_at=excluded.closes_at,
               active=1`,
            [
              serviceId,
              t.title,
              startsAtIso,
              endsAtIso,
              CHURCH_LOCATION.address,
              CHURCH_LOCATION.latitude,
              CHURCH_LOCATION.longitude,
              CHURCH_LOCATION.radius_m,
              opensAtIso,
              closesAtIso,
              nowIso()
            ]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error in syncChurchServicesFromTemplates:', err);
  }
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
        const row = await db.first('SELECT content_type, data FROM media WHERE id=?', [mediaId]);
        if (row && row.data) {
          const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Buffer.from(row.data);
          return new Response(bytes, {
            status: 200,
            headers: {
              'Content-Type': row.content_type || 'image/webp',
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
        const gcLeader = Boolean(
          await db.first('SELECT 1 FROM gc_leaders WHERE user_id=?', [user.id]) ||
          await db.first("SELECT 1 FROM members_people WHERE (account_user_id=? OR lower(email)=lower(?)) AND gc_role='leader' AND active=1", [user.id, user.email])
        );
        const minLeader = Boolean(
          await db.first('SELECT 1 FROM ministries_assignments ma JOIN members_people p ON p.id=ma.person_id WHERE (p.account_user_id=? OR lower(p.email)=lower(?)) AND ma.is_leader=1 AND ma.active=1', [user.id, user.email])
        );
        const publicUser = buildPublicUser(user, admins, pastors);
        return jsonResp({
          active_module: null,
          user: publicUser,
          platform_admin: isRoot,
          pastor: isPastor,
          gc_leader: gcLeader,
          ministry_leader: minLeader,
          encryption: 'AES-128-Fernet-HMAC-SHA256',
          notifications: notifs,
          notification_unread_count: Number(unread || 0),
          modules: Object.entries(MODULES).map(([key, name]) => {
            let roleForMod = grants[key]?.role || 'viewer';
            if (isRoot) roleForMod = key === 'kids' ? publicUser.role : 'admin';
            else if (isPastor) roleForMod = 'pastor';
            else if (key === 'kids') roleForMod = publicUser.role;
            else if (key === 'members' && (grants[key]?.role === 'leader' || gcLeader)) roleForMod = 'leader';
            else if (key === 'ministries' && (grants[key]?.role === 'leader' || minLeader)) roleForMod = 'leader';
            return {
              id: key,
              name,
              url: '/' + key,
              enabled: Boolean(isGlobal || grants[key]?.enabled || key === 'kids'),
              role: roleForMod,
              scope: isGlobal ? '' : (scopes[key] || ''),
              status: 'operational'
            };
          })
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
        const staffRows = await db.all("SELECT * FROM users WHERE role IN ('admin','teacher') OR staff_role='monitor' ORDER BY name");
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
            r.min_age, r.max_age,
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
        const resRows = await db.all('SELECT lesson_id, child_id FROM reservations WHERE confirmed=1');
        const byLesson = {};
        for (const r of resRows) (byLesson[r.lesson_id] ||= []).push(Number(r.child_id));
        const out = rows.map(l => ({
          ...l,
          confirmed_children: byLesson[l.id] || [],
          confirmed_count: (byLesson[l.id] || []).length,
          available: Math.max(0, Number(l.room_capacity || 20) - (byLesson[l.id] || []).length)
        }));
        return jsonResp(out);
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
        await syncChurchServicesFromTemplates(db);
        const now = nowIso();
        const nowIsoUtc = new Date().toISOString();
        const nowMs = Date.now();
        const person = await linkedPerson(db, user);
        const services = await db.all(
          `SELECT * FROM church_services 
           ORDER BY CASE WHEN closes_at >= ? THEN 0 ELSE 1 END ASC,
                    CASE WHEN closes_at >= ? THEN starts_at END ASC,
                    starts_at DESC LIMIT 100`,
          [nowIsoUtc, nowIsoUtc]
        );
        const items = [];
        for (const s of services) {
          if (!isGlobal && !s.active) continue;
          const own = person
            ? await db.first('SELECT checked_at,method,voided FROM church_presences WHERE service_id=? AND person_id=?', [s.id, person.id])
            : null;
          const opensMs = new Date(s.opens_at).getTime();
          const closesMs = new Date(s.closes_at).getTime();
          const canCheckin = Boolean(s.active && opensMs <= nowMs && nowMs <= closesMs);
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
          my_user_id: user.id,
          auto_enabled: autoRow ? (autoRow.church_auto_checkin !== 0) : true,
          server_time: now,
          timezone: 'America/Sao_Paulo'
        });
      }

      if (path === '/api/workspace/church-attendance' && method === 'POST') {
        if (!isGlobal) fail('permission', 'A gestão de presença é exclusiva da liderança.', 403);
        const body = await request.json();
        const rid = String(body.request_id || randomBytes(16).toString('hex'));
        const start = parseBrasiliaDate(body.starts_at);
        const end = parseBrasiliaDate(body.ends_at || body.starts_at);
        const earlyMin = Number(body.early_minutes != null ? body.early_minutes : 45);
        const lateMin = Number(body.late_minutes != null ? body.late_minutes : 150);
        const opensAt = new Date(start.getTime() - earlyMin * 60000).toISOString();
        const closesAt = new Date(Math.max(end.getTime() + 30 * 60000, start.getTime() + lateMin * 60000)).toISOString();
        const startsAtIso = start.toISOString();
        const endsAtIso = end.toISOString();
        const loc = (body.location || '').trim() || CHURCH_LOCATION.address;
        const lat = Number(body.latitude) || CHURCH_LOCATION.latitude;
        const lon = Number(body.longitude) || CHURCH_LOCATION.longitude;
        const rad = Number(body.radius_m) || CHURCH_LOCATION.radius_m;
        await db.run(
          'INSERT OR REPLACE INTO church_services(id,title,starts_at,ends_at,location,latitude,longitude,radius_m,opens_at,closes_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          [rid, body.title.trim(), startsAtIso, endsAtIso, loc, lat, lon, rad, opensAt, closesAt, user.id, nowIso()]
        );
        return jsonResp({ id: rid, ok: true });
      }

      if (path === '/api/workspace/church-attendance/preferences/automatic' && method === 'PATCH') {
        const body = await request.json();
        await db.run('UPDATE users SET church_auto_checkin=? WHERE id=?', [body.enabled ? 1 : 0, user.id]);
        return jsonResp({ ok: true, enabled: Boolean(body.enabled) });
      }

      if (path === '/api/workspace/church-attendance/geocode' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return jsonResp([]);
        const results = await fetchGeocode(q, env);
        return jsonResp(results);
      }

      if (path === '/api/workspace/church-attendance/reverse-geocode' && method === 'GET') {
        const lat = Number(url.searchParams.get('lat'));
        const lon = Number(url.searchParams.get('lon'));
        if (isNaN(lat) || isNaN(lon)) fail('coords', 'Coordenadas inválidas.', 400);
        const result = await fetchReverseGeocode(lat, lon, env);
        return jsonResp(result);
      }

      if (path.startsWith('/api/workspace/church-attendance/') && path.endsWith('/check-in') && method === 'POST') {
        const rid = path.split('/')[4];
        const body = await request.json();
        const srv = await db.first('SELECT * FROM church_services WHERE id=?', [rid]);
        if (!srv || !srv.active) fail('missing', 'Culto não encontrado ou inativo.', 404);
        const person = await linkedPerson(db, user);
        if (!person) fail('member', 'Seu cadastro de membro precisa estar vinculado à conta.', 409);
        const nowMs = Date.now();
        const opensMs = new Date(srv.opens_at).getTime();
        const closesMs = new Date(srv.closes_at).getTime();
        if (nowMs < opensMs || nowMs > closesMs) {
          fail('window', 'Fora da janela de check-in deste culto.', 409);
        }
        const meters = haversineMeters(Number(body.latitude), Number(body.longitude), Number(srv.latitude), Number(srv.longitude));
        const accuracy = Number(body.accuracy) || 0;
        // Allow buffer for phone GPS accuracy in buildings
        if (meters > srv.radius_m + Math.min(30, accuracy) || accuracy > 200) {
          fail('location', 'Localização fora da área permitida ou GPS impreciso. Aproxime-se do local do culto e tente novamente.', 409);
        }
        const checkedAt = nowIso();
        const regionLabel = String(body.region_label || '').trim();
        const reason = regionLabel ? `${regionLabel} · ${Math.round(meters)} m` : `${Math.round(meters)} m do local`;
        await db.run(
          "INSERT INTO church_presences(service_id,person_id,user_id,method,checked_at,actor,service_version,voided,reason) VALUES(?,?,?,?,?,?,?,0,?) ON CONFLICT(service_id,person_id) DO UPDATE SET user_id=excluded.user_id,method=excluded.method,checked_at=excluded.checked_at,actor=excluded.actor,service_version=excluded.service_version,voided=0,reason=excluded.reason",
          [rid, person.id, user.id, 'location', checkedAt, user.id, srv.version || 1, reason]
        );
        return jsonResp({ ok: true, already_present: false, checked_at: checkedAt, distance_m: Math.round(meters), region_label: regionLabel });
      }

      // Sector Modules: Members, Ministries, Finance
      if (path === '/api/members' || path === '/api/members/people') {
        if (method === 'GET') {
          const q = (url.searchParams.get('q') || '').toLowerCase();
          const page = Math.max(1, Number(url.searchParams.get('page') || 1));
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 200)));
          const rawCells = (await db.all('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count,(SELECT count(*) FROM members_families f WHERE f.cell_id=mc.id AND f.active=1) family_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name LIMIT 300')).map(r => decryptRecord(r, env));
          const cellMembersRows = await db.all("SELECT id, name, cell_id, gc_role FROM members_people WHERE active=1 AND cell_id IS NOT NULL AND cell_id != '' ORDER BY name");
          const byCellId = {};
          for (const cm of cellMembersRows) (byCellId[cm.cell_id] ||= []).push({ id: cm.id, name: cm.name, gc_role: cm.gc_role || 'member' });
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
          const occurrences = [];
          const spNow = new Date(Date.now() - 3 * 3600 * 1000);
          const startDay = new Date(Date.UTC(spNow.getUTCFullYear(), spNow.getUTCMonth(), spNow.getUTCDate()));
          for (let dayOffset = 0; dayOffset <= 45; dayOffset++) {
            const tDate = new Date(startDay.getTime() + dayOffset * 86400000);
            const isoWeekday = (tDate.getUTCDay() + 6) % 7;
            const yyyy = tDate.getUTCFullYear();
            const mm = String(tDate.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(tDate.getUTCDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            for (const t of templates) {
              if (Number(t.weekday) === isoWeekday) {
                const hiddenList = (t.hidden_dates || '').split(',').map(s => s.trim()).filter(Boolean);
                const isHidden = hiddenList.includes(dateStr);
                occurrences.push({
                  template_id: t.id,
                  title: t.title,
                  date: dateStr,
                  time: t.service_time,
                  duration_minutes: Number(t.duration_minutes || 90),
                  weekday: isoWeekday,
                  weekday_name: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][isoWeekday],
                  is_hidden: isHidden
                });
              }
            }
          }
          occurrences.sort((a, b) => (a.date + 'T' + a.time).localeCompare(b.date + 'T' + b.time));
          const apps = (await db.all("SELECT * FROM sector_applications WHERE target_type='ministry' AND status='pending' ORDER BY created_at DESC LIMIT 100")).map(r => decryptRecord(r, env));
          const myP = await linkedPerson(db, user);
          return jsonResp({
            assignments,
            schedules,
            resources,
            catalog: MINISTRY_CATALOG,
            worship_roles: WORSHIP_ROLES,
            service_templates: templates,
            service_occurrences: occurrences,
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
        const sched = await db.first('SELECT * FROM ministries_schedules WHERE id=?', [sid]);
        if (!sched) fail('missing', 'Escala não encontrada.', 404);
        const myP = await linkedPerson(db, user);
        const canManage = await canManageMinistry(db, user, sched.ministry, isGlobal, isPastor);
        if (!canManage && (!myP || myP.id !== sched.person_id)) {
          fail('forbidden', 'Você só pode responder às escalas atribuídas a você.', 403);
        }
        const reason = encryptText(body.reason || body.decline_reason || body.notes || '', env);
        await db.run('UPDATE ministries_schedules SET status=?, version=version+1 WHERE id=?', [status, sid]);
        await db.run('INSERT INTO schedule_responses(id,schedule_id,actor,previous_status,status,reason,created_at) VALUES(?,?,?,?,?,?,?)', [randomBytes(16).toString('hex'), sid, user.id, sched.status || 'pending', status, reason, nowIso()]);
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
              'INSERT INTO media(id,filename,content_type,data,created_by,created_at) VALUES(?,?,?,?,?,?)',
              [mediaId, uploadedPhoto.name || 'avatar.webp', mime, buf, user.id, nowIso()]
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
          const kRole = ['admin', 'teacher', 'monitor', 'parent'].includes(role) ? role : 'parent';
          if (kRole === 'monitor') {
            await db.run("UPDATE users SET role='teacher', staff_role='monitor' WHERE id=?", [uid]);
          } else if (kRole === 'teacher') {
            await db.run("UPDATE users SET role='teacher', staff_role='teacher' WHERE id=?", [uid]);
          } else if (kRole === 'admin') {
            await db.run("UPDATE users SET role='admin', staff_role='admin' WHERE id=?", [uid]);
          } else {
            await db.run("UPDATE users SET role='parent', staff_role='' WHERE id=?", [uid]);
          }
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
            await db.run('INSERT OR IGNORE INTO pastoral_users(user_id) VALUES(?)', [uid]);
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
          'INSERT INTO platform_announcements(id,title,message,target_sector,target_scope,audience_ids,author_id,author_name,active,created_at,publish_at,expires_at,require_ack,dispatched) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?,1)',
          [
            aid,
            String(body.title || '').trim(),
            encryptText(body.message || '', env),
            body.target_sector || 'all',
            body.target_scope || body.audience_value || '',
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
          members: [['people', 'members_people', 'name', 'created_at'], ['families', 'members_families', 'name', 'created_at'], ['cells', 'members_cells', 'name', 'created_at']],
          ministries: [['schedules', 'ministries_schedules', 'title', 'created_at'], ['assignments', 'ministries_assignments', 'ministry', 'created_at'], ['resources', 'ministries_resources', 'title', 'created_at']],
          finance: [['accounts', 'finance_accounts', 'name', 'created_at'], ['cost-centers', 'finance_cost_centers', 'name', 'created_at'], ['entries', 'finance_entries', 'description', 'created_at'], ['closings', 'finance_service_closings', 'service_name', 'created_at'], ['invoices', 'finance_invoices', 'number', 'created_at']],
          kids: [['children', 'children', 'name', 'created_at'], ['rooms', 'rooms', 'name', "''"], ['lessons', 'lessons', 'title', 'starts_at'], ['events', 'events', 'title', 'created_at']]
        }[mod] || [];
        const items = [];
        for (const [kind, tbl, col, tsCol] of tables) {
          const flagCol = tbl === 'children' ? 'archived=1' : 'active=0';
          const rows = await db.all(`SELECT id, ${col} as label, ${tsCol} as created_at FROM ${tbl} WHERE ${flagCol} ORDER BY id DESC LIMIT 50`);
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
        const gcRole = body.gc_role === 'leader' ? 'leader' : 'member';
        await db.run(
          'INSERT OR REPLACE INTO members_people(id,family_id,cell_id,name,relationship,phone,email,birthday,baptism_date,joined_on,integration_stage,pastoral_notes,active,version,created_at,created_by,address,marital_status,profession,bio,gc_role) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,?)',
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
            body.bio || '',
            gcRole
          ]
        );
        if (gcRole === 'leader' && body.cell_id) {
          await db.run('UPDATE members_cells SET leader_name=?, version=version+1 WHERE id=?', [String(body.name || '').trim(), body.cell_id]);
        }
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
        const gcRole = body.gc_role !== undefined ? (body.gc_role === 'leader' ? 'leader' : 'member') : (old.gc_role || 'member');
        const targetCellId = body.cell_id !== undefined ? (body.cell_id || null) : old.cell_id;
        await db.run(
          'UPDATE members_people SET name=?, phone=?, email=?, birthday=?, integration_stage=?, family_id=?, cell_id=?, address=?, gc_role=?, version=version+1 WHERE id=?',
          [
            body.name !== undefined ? String(body.name).trim() : old.name,
            body.phone !== undefined ? String(body.phone) : old.phone,
            body.email !== undefined ? String(body.email) : old.email,
            body.birthday !== undefined ? (body.birthday || null) : old.birthday,
            body.integration_stage || old.integration_stage || 'active_member',
            body.family_id !== undefined ? (body.family_id || null) : old.family_id,
            targetCellId,
            body.address !== undefined ? encryptText(body.address || '', env) : old.address,
            gcRole,
            pid
          ]
        );
        const linkedUid = old.account_user_id || (old.email ? (await db.first('SELECT id FROM users WHERE lower(email)=lower(?)', [old.email]))?.id : null);
        if (linkedUid && targetCellId) {
          if (gcRole === 'leader') {
            await db.run('INSERT OR IGNORE INTO gc_leaders(cell_id,user_id) VALUES(?,?)', [targetCellId, linkedUid]);
            await db.run('UPDATE members_cells SET leader_name=?, version=version+1 WHERE id=?', [body.name !== undefined ? String(body.name).trim() : old.name, targetCellId]);
          } else {
            await db.run('DELETE FROM gc_leaders WHERE cell_id=? AND user_id=?', [targetCellId, linkedUid]);
          }
        }
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
          if (!isGlobal && !isPastor) fail('forbidden', 'Apenas administradores podem excluir um GC.', 403);
          await db.run('UPDATE members_cells SET active=0, version=version+1 WHERE id=?', [cid]);
          return jsonResp({ ok: true });
        }
        if (!await canManageGC(db, user, cid, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas o líder deste GC ou a administração podem alterar suas informações.', 403);
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
          "INSERT INTO members_self_registrations(id,name,phone,email,birthday,family_name,address,integration_stage,status,created_at,owner_id,version) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,1)",
          [rid, String(body.name || '').trim(), body.phone || '', body.email || '', body.birthday || null, body.family_name || '', encryptText(body.address || '', env), body.integration_stage || 'visitor', nowIso(), user.id]
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
        await db.run("UPDATE members_self_registrations SET status='approved', person_id=? WHERE id=?", [pid, rid]);
        return jsonResp({ ok: true, person_id: pid });
      }

      if (path.startsWith('/api/members/self-registrations/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run("UPDATE members_self_registrations SET status='rejected' WHERE id=?", [rid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/members/gc-applications/') && path.endsWith('/approve') && method === 'POST') {
        const rid = path.split('/')[4];
        const app = await db.first('SELECT * FROM sector_applications WHERE id=?', [rid]);
        if (!app) fail('missing', 'Solicitação não encontrada.', 404);
        const cell = await db.first('SELECT id FROM members_cells WHERE id=? OR lower(name)=lower(?)', [app.target_id, app.target_name]);
        const cellId = cell ? cell.id : app.target_id;
        if (!await canManageGC(db, user, cellId, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas o líder deste GC ou a administração podem aprovar inscrições.', 403);
        }
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
        if (!await canManageMinistry(db, user, body.ministry, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas líderes deste ministério ou a administração podem vincular integrantes.', 403);
        }
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
        const old = await db.first('SELECT ministry FROM ministries_assignments WHERE id=?', [aid]);
        if (!await canManageMinistry(db, user, old?.ministry, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas líderes deste ministério ou a administração podem alterar integrantes.', 403);
        }
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
        if (!await canManageMinistry(db, user, body.ministry, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas líderes deste ministério podem criar escalas.', 403);
        }
        const sid = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO ministries_schedules(id,title,ministry,service_date,service_time,person_id,role_notes,status,active,version,created_at,created_by,duration_minutes,response_due_at,reminder_enabled) VALUES(?,?,?,?,?,?,?,?,1,1,?,?,?,?,?)',
          [
            sid,
            String(body.title || 'Culto de Celebração').trim(),
            body.ministry || 'Music',
            body.service_date || todayStr(),
            body.service_time || '18:00',
            body.person_id,
            body.role_notes || '',
            body.status || 'confirmed',
            nowIso(),
            user.id,
            Number(body.duration_minutes || 60),
            body.response_due_at || '',
            body.reminder_enabled ? 1 : 0
          ]
        );
        return jsonResp({ ok: true, id: sid });
      }

      if (path.startsWith('/api/ministries/schedules/') && !path.endsWith('/respond') && (method === 'PUT' || method === 'DELETE')) {
        const sid = path.split('/')[4];
        const old = await db.first('SELECT ministry FROM ministries_schedules WHERE id=?', [sid]);
        if (!await canManageMinistry(db, user, old?.ministry, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas líderes deste ministério podem alterar ou excluir escalas.', 403);
        }
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
            'INSERT INTO ministries_schedules(id,title,ministry,service_date,service_time,person_id,role_notes,status,active,version,created_at,created_by,duration_minutes) VALUES(?,?,?,?,?,?,?,?,1,1,?,?,90)',
            [sid, body.title || 'Culto de Celebração', 'Music', body.service_date || todayStr(), body.service_time || '18:00', m.person_id, m.instrument || 'Integrante', 'pending', nowIso(), user.id]
          );
          ids.push(sid);
        }
        if (body.repertoire_notes) {
          const rid = randomBytes(16).toString('hex');
          await db.run(
            'INSERT INTO ministries_resources(id,ministry,title,category,notes,resource_url,active,version,created_at,created_by) VALUES(?,?,?,?,?,?,1,1,?,?)',
            [rid, 'Music', `${body.title || 'Culto'} (${body.service_date})`, 'repertorio', encryptText(body.repertoire_notes, env), body.resource_url || '', nowIso(), user.id]
          );
        }
        return jsonResp({ ok: true, created: ids.length, schedule_ids: ids });
      }

      if (path === '/api/ministries/resources' && method === 'POST') {
        const body = await request.json();
        if (!await canManageMinistry(db, user, body.ministry, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas líderes deste ministério podem publicar materiais.', 403);
        }
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
        if (!await canManageGC(db, user, gid, isGlobal, isPastor)) {
          fail('forbidden', 'Apenas o líder deste GC pode cadastrar reuniões.', 403);
        }
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
          'INSERT OR REPLACE INTO service_templates(id,title,weekday,service_time,duration_minutes,created_by,created_at,hidden_dates) VALUES(?,?,?,?,?,?,?,coalesce(?, \'\'))',
          [rid, String(body.title || 'Culto').trim(), Number(body.weekday || 0), body.service_time || '18:00', Number(body.duration_minutes || 90), user.id, nowIso(), body.hidden_dates || '']
        );
        await syncChurchServicesFromTemplates(db, true);
        return jsonResp({ ok: true, id: rid });
      }

      if (path.startsWith('/api/workspace/services/') && path.endsWith('/hide-date') && method === 'POST') {
        const rid = path.split('/')[4];
        const body = await request.json();
        const targetDate = String(body.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) fail('date', 'Data inválida (formato AAAA-MM-DD).', 400);
        const row = await db.first('SELECT * FROM service_templates WHERE id=?', [rid]);
        if (!row) fail('not_found', 'Culto padrão não encontrado.', 404);
        let dates = (row.hidden_dates || '').split(',').map(s => s.trim()).filter(Boolean);
        if (body.action === 'unhide') {
          dates = dates.filter(d => d !== targetDate);
        } else {
          if (!dates.includes(targetDate)) dates.push(targetDate);
          dates.sort();
        }
        const newHiddenStr = dates.join(',');
        await db.run('UPDATE service_templates SET hidden_dates=? WHERE id=?', [newHiddenStr, rid]);
        await syncChurchServicesFromTemplates(db, true);
        return jsonResp({ ok: true, id: rid, hidden_dates: newHiddenStr });
      }

      if (path.startsWith('/api/workspace/services/') && method === 'DELETE') {
        const rid = path.split('/')[4];
        await db.run('UPDATE service_templates SET active=0 WHERE id=?', [rid]);
        await syncChurchServicesFromTemplates(db, true);
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
        const start = parseBrasiliaDate(body.starts_at);
        const end = parseBrasiliaDate(body.ends_at || body.starts_at);
        const earlyMin = Number(body.early_minutes != null ? body.early_minutes : 45);
        const lateMin = Number(body.late_minutes != null ? body.late_minutes : 150);
        const opensAt = new Date(start.getTime() - earlyMin * 60000).toISOString();
        const closesAt = new Date(Math.max(end.getTime() + 30 * 60000, start.getTime() + lateMin * 60000)).toISOString();
        const startsAtIso = start.toISOString();
        const endsAtIso = end.toISOString();
        const loc = (body.location || '').trim() || CHURCH_LOCATION.address;
        const lat = Number(body.latitude) || CHURCH_LOCATION.latitude;
        const lon = Number(body.longitude) || CHURCH_LOCATION.longitude;
        const rad = Number(body.radius_m) || CHURCH_LOCATION.radius_m;
        await db.run(
          'UPDATE church_services SET title=?, starts_at=?, ends_at=?, location=?, latitude=?, longitude=?, radius_m=?, opens_at=?, closes_at=?, version=version+1 WHERE id=?',
          [body.title.trim(), startsAtIso, endsAtIso, loc, lat, lon, rad, opensAt, closesAt, rid]
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

// Helper function for ATA Brazilian Real currency formatting
      function formatMoneyPtBr(cents) {
        const n = (Number(cents || 0) / 100);
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function formatDatePtBr(isoStr) {
        if (!isoStr) return '';
        const parts = String(isoStr).slice(0, 10).split('-');
        if (parts.length < 3) return String(isoStr);
        return parts[2] + '/' + parts[1] + '/' + parts[0];
      }

      if (path === '/api/finance/entries' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        await db.run(
          'INSERT OR REPLACE INTO finance_entries(id,account_id,cost_center_id,direction,description,occurred_on,amount_cents,active,version,created_at,category,payment_status,payment_method,due_date,created_by,file_id) VALUES(?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,?)',
          [id, body.account_id, body.cost_center_id || null, body.direction || 'income', String(body.description || '').trim(), body.occurred_on || todayStr(), toCents(body.amount), nowIso(), body.category || 'Geral', body.payment_status || 'paid', body.payment_method || 'pix', body.due_date || null, user.id, body.file_id || null]
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
          'UPDATE finance_entries SET account_id=?, cost_center_id=?, direction=?, description=?, occurred_on=?, amount_cents=?, payment_status=?, payment_method=?, due_date=?, file_id=?, version=version+1 WHERE id=?',
          [body.account_id, body.cost_center_id || null, body.direction || 'income', String(body.description || '').trim(), body.occurred_on || todayStr(), toCents(body.amount), body.payment_status || 'paid', body.payment_method || 'pix', body.due_date || null, body.file_id || null, id]
        );
        return jsonResp({ ok: true, id });
      }

      if (path === '/api/finance/closings' && method === 'POST') {
        const body = await request.json();
        const id = String(body.request_id || randomBytes(16).toString('hex'));
        const t = toCents(body.tithes), oc = toCents(body.offerings_cash), op = toCents(body.offerings_pix), ocard = toCents(body.offerings_card);
        const total = t + oc + op + ocard;
        await db.run(
          'INSERT OR REPLACE INTO finance_service_closings(id,service_name,service_date,account_id,tithes_cents,offerings_cash_cents,offerings_pix_cents,offerings_card_cents,total_cents,counted_by,verified_by,notes,active,version,created_at,created_by,file_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?,?)',
          [id, body.service_name || 'Culto', body.service_date || todayStr(), body.account_id, t, oc, op, ocard, total, body.counted_by || user.name, body.verified_by || '', encryptText(body.notes || '', env), nowIso(), user.id, body.file_id || null]
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
          'UPDATE finance_service_closings SET service_name=?, service_date=?, account_id=?, tithes_cents=?, offerings_cash_cents=?, offerings_pix_cents=?, offerings_card_cents=?, total_cents=?, counted_by=?, verified_by=?, notes=?, file_id=?, version=version+1 WHERE id=?',
          [body.service_name || 'Culto', body.service_date || todayStr(), body.account_id, t, oc, op, ocard, t + oc + op + ocard, body.counted_by || user.name, body.verified_by || '', encryptText(body.notes || '', env), body.file_id || null, id]
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

      // === REPORT & ATA DE REGISTRO EMISSION ===
      if (path === '/api/finance/report' && method === 'GET') {
        const urlObj = new URL(request.url);
        const preset = urlObj.searchParams.get('preset') || 'mensal';
        let startDate = urlObj.searchParams.get('start_date');
        let endDate = urlObj.searchParams.get('end_date') || todayStr();
        const format = urlObj.searchParams.get('format') || 'html';
        const accountId = urlObj.searchParams.get('account_id') || '';
        const costCenterId = urlObj.searchParams.get('cost_center_id') || '';
        const direction = urlObj.searchParams.get('direction') || 'all';
        const paymentStatus = urlObj.searchParams.get('payment_status') || 'all';
        const churchName = (urlObj.searchParams.get('church_name') || '').trim();
        const serviceName = (urlObj.searchParams.get('service_name') || '').trim();
        const serviceTime = (urlObj.searchParams.get('service_time') || '').trim();
        const pastor = (urlObj.searchParams.get('pastor') || '').trim();
        const treasurer = (urlObj.searchParams.get('treasurer') || user.name || '').trim();
        const deacon = (urlObj.searchParams.get('deacon') || '').trim();
        const includeAttachments = urlObj.searchParams.get('include_attachments') !== 'false';

        // Automatic period preset date resolution
        if (!startDate) {
          if (preset === 'dia') {
            startDate = endDate;
          } else if (preset === 'semanal') {
            const d = new Date(endDate);
            d.setDate(d.getDate() - 6);
            startDate = d.toISOString().slice(0, 10);
          } else if (preset === 'mensal') {
            startDate = endDate.slice(0, 7) + '-01';
          } else if (preset === 'trimestral') {
            const d = new Date(endDate);
            d.setDate(d.getDate() - 89);
            startDate = d.toISOString().slice(0, 10);
          } else if (preset === 'semestral') {
            const d = new Date(endDate);
            d.setDate(d.getDate() - 179);
            startDate = d.toISOString().slice(0, 10);
          } else {
            startDate = endDate.slice(0, 7) + '-01';
          }
        }

        // Query entries
        let entrySql = 'SELECT e.*, a.name as account_name, coalesce(a.bank,"") as account_bank, coalesce(cc.name,"") as cost_center_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id WHERE e.active=1 AND e.occurred_on >= ? AND e.occurred_on <= ?';
        const entryParams = [startDate, endDate];
        if (accountId) { entrySql += ' AND e.account_id = ?'; entryParams.push(accountId); }
        if (costCenterId) { entrySql += ' AND e.cost_center_id = ?'; entryParams.push(costCenterId); }
        if (direction !== 'all') { entrySql += ' AND e.direction = ?'; entryParams.push(direction); }
        if (paymentStatus !== 'all') { entrySql += ' AND coalesce(e.payment_status, "paid") = ?'; entryParams.push(paymentStatus); }
        entrySql += ' ORDER BY e.occurred_on DESC, e.created_at DESC';
        const entries = (await db.all(entrySql, entryParams)).map(r => decryptRecord(r, env));

        // Query service closings
        let closingSql = 'SELECT sc.*, a.name as account_name FROM finance_service_closings sc JOIN finance_accounts a ON a.id=sc.account_id WHERE sc.active=1 AND sc.service_date >= ? AND sc.service_date <= ?';
        const closingParams = [startDate, endDate];
        if (accountId) { closingSql += ' AND sc.account_id = ?'; closingParams.push(accountId); }
        closingSql += ' ORDER BY sc.service_date DESC';
        const closings = (await db.all(closingSql, closingParams)).map(r => decryptRecord(r, env));

        // Query invoices
        let invSql = 'SELECT fi.*, e.description as entry_description, e.cost_center_id, cc.name as cost_center_name FROM finance_invoices fi LEFT JOIN finance_entries e ON e.id=fi.entry_id LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id WHERE fi.active=1 AND ((fi.issued_on >= ? AND fi.issued_on <= ?) OR fi.entry_id IN (SELECT id FROM finance_entries WHERE active=1 AND occurred_on >= ? AND occurred_on <= ?)) ORDER BY fi.issued_on DESC';
        const invoices = (await db.all(invSql, [startDate, endDate, startDate, endDate])).map(r => decryptRecord(r, env));

        // Calculate ATA totals
        const closingsCash = closings.reduce((sum, c) => sum + Number(c.offerings_cash_cents || 0), 0);
        const entriesCash = entries.filter(e => e.direction === 'income' && ['cash', 'dinheiro', 'especie'].includes(e.payment_method)).reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);
        const totalEspecieCents = closingsCash + entriesCash;

        const closingsCard = closings.reduce((sum, c) => sum + Number(c.offerings_card_cents || 0), 0);
        const entriesCard = entries.filter(e => e.direction === 'income' && ['card', 'credit_card', 'debit_card', 'cartao'].includes(e.payment_method)).reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);
        const totalCartaoCents = closingsCard + entriesCard;

        const closingsPix = closings.reduce((sum, c) => sum + Number(c.tithes_cents || 0) + Number(c.offerings_pix_cents || 0), 0);
        const entriesPix = entries.filter(e => e.direction === 'income' && !['cash', 'dinheiro', 'especie', 'card', 'credit_card', 'debit_card', 'cartao'].includes(e.payment_method)).reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);
        const totalPixCents = closingsPix + entriesPix;

        const totalGeralCents = totalEspecieCents + totalCartaoCents + totalPixCents;
        const repasseConvencaoCents = Math.round(totalGeralCents * 0.10);
        const repasseRegionalCents = Math.round(totalGeralCents * 0.05);
        const valorLiquidoCents = totalGeralCents - repasseConvencaoCents - repasseRegionalCents;
        const totalDespesasCents = entries.filter(e => e.direction === 'expense').reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);

        // Retrieve attached files (Notas Fiscais & Comprovantes)
        const attachments = [];
        const seenFileIds = new Set();
        if (includeAttachments) {
          for (const inv of invoices) {
            if (inv.file_id && !seenFileIds.has(inv.file_id)) {
              seenFileIds.add(inv.file_id);
              const file = await db.first('SELECT id, filename, content_type, data FROM finance_files WHERE id=?', [inv.file_id]);
              if (file) {
                const isImg = Boolean(file.content_type?.startsWith('image/'));
                const isPdf = file.content_type === 'application/pdf';
                let dataUrl = '';
                if (isImg && file.data) {
                  const b = file.data instanceof ArrayBuffer ? Buffer.from(file.data) : Buffer.from(file.data);
                  dataUrl = 'data:' + file.content_type + ';base64,' + b.toString('base64');
                }
                attachments.push({
                  type: 'invoice',
                  number: inv.number,
                  supplier: inv.supplier,
                  date: inv.issued_on,
                  amount_cents: inv.amount_cents,
                  cost_center: inv.cost_center_name || 'Despesa Geral',
                  file_id: inv.file_id,
                  filename: file.filename || 'nota_fiscal.pdf',
                  content_type: file.content_type,
                  is_image: isImg,
                  is_pdf: isPdf,
                  data_url: dataUrl
                });
              }
            }
          }

          for (const ent of entries) {
            if (ent.file_id && !seenFileIds.has(ent.file_id)) {
              seenFileIds.add(ent.file_id);
              const file = await db.first('SELECT id, filename, content_type, data FROM finance_files WHERE id=?', [ent.file_id]);
              if (file) {
                const isImg = Boolean(file.content_type?.startsWith('image/'));
                const isPdf = file.content_type === 'application/pdf';
                let dataUrl = '';
                if (isImg && file.data) {
                  const b = file.data instanceof ArrayBuffer ? Buffer.from(file.data) : Buffer.from(file.data);
                  dataUrl = 'data:' + file.content_type + ';base64,' + b.toString('base64');
                }
                attachments.push({
                  type: 'entry',
                  number: 'LANÇ-' + String(ent.id).slice(0, 6).toUpperCase(),
                  supplier: ent.description,
                  date: ent.occurred_on,
                  amount_cents: ent.amount_cents,
                  cost_center: ent.cost_center_name || ent.category || 'Geral',
                  file_id: ent.file_id,
                  filename: file.filename || 'comprovante.pdf',
                  content_type: file.content_type,
                  is_image: isImg,
                  is_pdf: isPdf,
                  data_url: dataUrl
                });
              }
            }
          }
        }

        const ataMetadata = {
          church_name: churchName,
          service_name: serviceName,
          service_date: endDate,
          service_time: serviceTime,
          period_preset: preset,
          start_date: startDate,
          end_date: endDate,
          totals: {
            total_especie_cents: totalEspecieCents,
            total_cartao_cents: totalCartaoCents,
            total_pix_cents: totalPixCents,
            total_geral_cents: totalGeralCents,
            repasse_convencao_cents: repasseConvencaoCents,
            repasse_regional_cents: repasseRegionalCents,
            valor_liquido_cents: valorLiquidoCents,
            total_despesas_cents: totalDespesasCents
          },
          participants: {
            pastor,
            treasurer,
            deacon
          }
        };

        if (format === 'json') {
          return jsonResp({ ata: ataMetadata, closings, entries, invoices, attachments_count: attachments.length, generated_at: nowIso() });
        }

        if (format === 'csv') {
          const lines = [
            ['LAGOINHA GLOBAL', 'ATA DE REGISTRO FINANCEIRO'],
            ['Igreja/GC', churchName],
            ['Culto/Descrição', serviceName],
            ['Período', startDate + ' a ' + endDate],
            ['Data/Horário', endDate + ' às ' + serviceTime],
            [],
            ['RESUMO DA ATA', 'VALOR (R$)'],
            ['Total em espécie', (totalEspecieCents / 100).toFixed(2)],
            ['Cartão de crédito/débito', (totalCartaoCents / 100).toFixed(2)],
            ['Transferência, Pix', (totalPixCents / 100).toFixed(2)],
            ['TOTAL GERAL', (totalGeralCents / 100).toFixed(2)],
            ['Repasse Convenção 10%', (repasseConvencaoCents / 100).toFixed(2)],
            ['Repasse Regional 5%', (repasseRegionalCents / 100).toFixed(2)],
            ['VALOR LÍQUIDO', (valorLiquidoCents / 100).toFixed(2)],
            ['Despesas no Período', (totalDespesasCents / 100).toFixed(2)],
            [],
            ['PARTICIPANTES', 'NOME'],
            ['Pastor', pastor],
            ['Tesoureiro', treasurer],
            ['Diácono', deacon],
            [],
            ['LANÇAMENTOS DO PERÍODO'],
            ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Meio de Pagamento', 'Valor (R$)', 'Status', 'Anexo']
          ];
          for (const e of entries) {
            lines.push([e.occurred_on, e.direction === 'income' ? 'Entrada' : 'Saída', e.description, e.cost_center_name || e.category, e.account_name, e.payment_method, (e.amount_cents / 100).toFixed(2), e.payment_status, e.file_id ? 'Sim' : 'Não']);
          }
          lines.push([]);
          lines.push(['NOTAS FISCAIS DO PERÍODO']);
          lines.push(['Número', 'Fornecedor', 'Data Emissão', 'Valor (R$)', 'Centro de Custo', 'Anexo']);
          for (const i of invoices) {
            lines.push([i.number, i.supplier, i.issued_on, (i.amount_cents / 100).toFixed(2), i.cost_center_name || 'Geral', i.file_id ? 'Sim' : 'Não']);
          }
          const csvText = lines.map(row => row.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
          return new Response(csvText, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="ata-financeira-' + preset + '-' + endDate + '.csv"'
            }
          });
        }

        if (format === 'xlsx') {
          const xlsxHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ATA DE REGISTRO</title></head><body>'
            + '<h2>LAGOINHA GLOBAL - ATA DE REGISTRO</h2>'
            + '<p><strong>Igreja/GC:</strong> ' + churchName + ' | <strong>Culto:</strong> ' + serviceName + ' | <strong>Período:</strong> ' + startDate + ' a ' + endDate + '</p>'
            + '<table border="1" cellpadding="6">'
            + '<tr style="background:#1a2451;color:#fff;"><th colspan="2">RESUMO DA ATA DE REGISTRO</th></tr>'
            + '<tr><td>Total em espécie</td><td>R$ ' + formatMoneyPtBr(totalEspecieCents) + '</td></tr>'
            + '<tr><td>Cartão de crédito/débito</td><td>R$ ' + formatMoneyPtBr(totalCartaoCents) + '</td></tr>'
            + '<tr><td>Transferência, Pix</td><td>R$ ' + formatMoneyPtBr(totalPixCents) + '</td></tr>'
            + '<tr style="font-weight:bold;"><td>TOTAL GERAL</td><td>R$ ' + formatMoneyPtBr(totalGeralCents) + '</td></tr>'
            + '<tr style="font-weight:bold;"><td>Repasse Convenção 10%</td><td>R$ ' + formatMoneyPtBr(repasseConvencaoCents) + '</td></tr>'
            + '<tr><td>Repasse Regional 5%</td><td>R$ ' + formatMoneyPtBr(repasseRegionalCents) + '</td></tr>'
            + '<tr style="font-weight:bold;"><td>VALOR LÍQUIDO</td><td>R$ ' + formatMoneyPtBr(valorLiquidoCents) + '</td></tr>'
            + '</table><br>'
            + '<h3>LANÇAMENTOS DO PERÍODO</h3>'
            + '<table border="1" cellpadding="5">'
            + '<tr style="background:#e2e8f0;"><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Meio</th><th>Valor (R$)</th><th>Status</th></tr>'
            + entries.map(e => '<tr><td>' + e.occurred_on + '</td><td>' + (e.direction === 'income' ? 'Entrada' : 'Saída') + '</td><td>' + e.description + '</td><td>' + (e.cost_center_name || e.category) + '</td><td>' + e.account_name + '</td><td>' + e.payment_method + '</td><td>' + formatMoneyPtBr(e.amount_cents) + '</td><td>' + e.payment_status + '</td></tr>').join('')
            + '</table><br>'
            + '<h3>NOTAS FISCAIS</h3>'
            + '<table border="1" cellpadding="5">'
            + '<tr style="background:#e2e8f0;"><th>Número</th><th>Fornecedor</th><th>Data</th><th>Valor (R$)</th><th>Centro de Custo</th></tr>'
            + invoices.map(i => '<tr><td>' + i.number + '</td><td>' + i.supplier + '</td><td>' + i.issued_on + '</td><td>' + formatMoneyPtBr(i.amount_cents) + '</td><td>' + (i.cost_center_name || 'Geral') + '</td></tr>').join('')
            + '</table></body></html>';
          return new Response(xlsxHtml, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
              'Content-Disposition': 'attachment; filename="ata-financeira-' + preset + '-' + endDate + '.xls"'
            }
          });
        }

        // DEFAULT: FORMAT === 'HTML' (EXACT LAYOUT OF REFERENCE PDF + ATTACHED NOTAS FISCAIS)
        const dateParts = (endDate || todayStr()).split('-');
        const dStr = dateParts[2] || '01', mStr = dateParts[1] || '01', yStr = dateParts[0] || '2026';
        const formattedEndDate = dStr + '/' + mStr + '/' + yStr;
        const periodLabel = startDate === endDate ? formattedEndDate : (formatDatePtBr(startDate) + ' a ' + formattedEndDate);

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATA DE REGISTRO - ${churchName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
    
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a2451;
      background: #f1f5f9;
      padding: 24px 16px;
      line-height: 1.4;
    }

    .no-print {
      max-width: 800px;
      margin: 0 auto 20px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }

    .btn-action {
      background: #1a2451;
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      transition: background 0.15s ease;
    }

    .btn-action:hover {
      background: #111827;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    .ata-page {
      max-width: 800px;
      margin: 0 auto 30px auto;
      background: #ffffff;
      padding: 36px 44px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      min-height: 1060px;
      position: relative;
    }

    /* HEADER */
    .ata-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 24px;
    }

    .ata-logo {
      width: 105px;
      height: 105px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .ata-logo img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .ata-title-pill {
      background: #1a2451;
      border-radius: 9999px;
      padding: 14px 42px;
      flex: 1;
      max-width: 580px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(26, 36, 81, 0.15);
    }

    .ata-title-pill h1 {
      color: #ffffff;
      font-size: 32px;
      letter-spacing: 0.5px;
      margin: 0;
      line-height: 1.1;
    }

    .ata-title-pill .title-ata {
      font-weight: 700;
    }

    .ata-title-pill .title-registro {
      font-weight: 300;
    }

    /* INFO CARD */
    .ata-info-card {
      border: 1.5px solid #1a2451;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 22px;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .info-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .info-label {
      font-weight: 700;
      color: #1a2451;
      min-width: 82px;
      font-size: 14px;
    }

    .info-value {
      flex: 1;
      border-bottom: 1.5px dotted #94a3b8;
      padding-bottom: 2px;
      font-weight: 600;
      color: #0f172a;
      min-height: 20px;
    }

    .info-row-datetime {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .date-col {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .date-boxes {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-bottom: 1.5px dotted #94a3b8;
      padding: 0 10px 2px;
      font-weight: 600;
      color: #0f172a;
    }

    .time-col {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .time-box {
      border-bottom: 1.5px dotted #94a3b8;
      padding: 0 16px 2px;
      font-weight: 600;
      color: #0f172a;
    }

    /* TABLE CARD */
    .ata-table-card {
      border: 1.5px solid #1a2451;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 22px;
    }

    .table-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 20px;
      border-bottom: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .row-label {
      font-size: 13.5px;
      font-weight: 500;
      color: #1a2451;
    }

    .row-label.bold {
      font-weight: 700;
      font-size: 14px;
    }

    .repasse-title {
      font-size: 15px;
      font-weight: 800;
      color: #1a2451;
    }

    .amount-pill {
      background: #e6e7e8;
      border-radius: 8px;
      padding: 5px 14px;
      font-size: 15px;
      font-weight: 600;
      color: #1a2451;
      min-width: 150px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .amount-pill.bold {
      font-weight: 800;
      font-size: 15.5px;
    }

    .amount-pill .currency {
      color: #1a2451;
      font-weight: 500;
      margin-right: 8px;
    }

    /* CONTAS */
    .contas-box {
      background: #ffffff;
      border-top: 1px solid #1a2451;
      border-bottom: 1px solid #1a2451;
      padding: 12px 20px;
    }

    .contas-title {
      font-weight: 700;
      font-size: 14px;
      color: #1a2451;
      margin-bottom: 8px;
    }

    .contas-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      font-size: 13px;
    }

    .conta-item strong {
      font-weight: 700;
      color: #1a2451;
      display: block;
      margin-bottom: 2px;
      font-size: 13.5px;
    }

    .conta-item div {
      color: #1a2451;
      font-weight: 500;
      line-height: 1.35;
    }

    /* PARTICIPANTS CARD */
    .ata-participants-card {
      border: 1.5px solid #1a2451;
      border-radius: 12px;
      padding: 16px 20px;
    }

    .participants-title {
      font-weight: 800;
      font-size: 14px;
      color: #1a2451;
      margin-bottom: 14px;
      letter-spacing: 0.2px;
    }

    .participant-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }

    .participant-row:last-child {
      margin-bottom: 0;
    }

    .participant-info {
      flex: 1.1;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .participant-role {
      font-weight: 700;
      color: #1a2451;
      font-size: 13.5px;
      min-width: 82px;
    }

    .participant-name {
      flex: 1;
      border-bottom: 1.5px dotted #94a3b8;
      padding-bottom: 2px;
      font-weight: 600;
      color: #0f172a;
      font-size: 13.5px;
    }

    .participant-sign {
      flex: 1;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .sign-label {
      font-weight: 600;
      color: #1a2451;
      font-size: 13px;
    }

    .sign-line {
      flex: 1;
      border-bottom: 1.5px solid #1a2451;
      min-height: 16px;
    }

    /* ATTACHMENTS PAGE */
    .page-break {
      page-break-before: always;
      break-before: page;
      margin-top: 30px;
    }

    .attachments-header {
      background: #1a2451;
      color: #ffffff;
      padding: 16px 24px;
      border-radius: 10px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .attachments-header h2 {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
    }

    .attachments-header span {
      font-size: 13px;
      color: #cbd5e1;
    }

    .att-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }

    .att-table th {
      background: #f1f5f9;
      color: #1a2451;
      font-weight: 700;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }

    .att-table td {
      padding: 9px 12px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }

    .attachment-card {
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      margin-bottom: 24px;
      overflow: hidden;
      page-break-inside: avoid;
      background: #ffffff;
    }

    .att-card-head {
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .att-card-body {
      padding: 20px;
      text-align: center;
      background: #fafafa;
    }

    .att-card-body img {
      max-width: 100%;
      max-height: 720px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      object-fit: contain;
    }

    .att-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      background: #e2e8f0;
      color: #1e293b;
    }

    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .ata-page {
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
        min-height: auto !important;
      }
      .page-break {
        margin-top: 0;
      }
    }
  </style>
</head>
<body>

  <div class="no-print">
    <div style="display:flex; align-items:center; gap:12px;">
      <button class="btn-action" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
      <span style="font-size:13px; color:#64748b; font-weight:600;">Período: ${periodLabel}</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <a class="btn-action btn-secondary" href="?format=xlsx&start_date=${startDate}&end_date=${endDate}">📊 Baixar Excel</a>
      <a class="btn-action btn-secondary" href="?format=csv&start_date=${startDate}&end_date=${endDate}">📄 Baixar CSV</a>
      <button class="btn-action btn-secondary" onclick="window.close()">✕ Fechar</button>
    </div>
  </div>

  <main class="ata-page">
    <!-- HEADER -->
    <header class="ata-header">
      <div class="ata-logo">
        <img src="data:image/png;base64,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" alt="Lagoinha Logo" />
      </div>
      <div class="ata-title-pill">
        <h1><span class="title-ata">ATA</span> <span class="title-registro">DE REGISTRO</span></h1>
      </div>
    </header>

    <!-- INFO BOX -->
    <section class="ata-info-card">
      <div class="info-row">
        <span class="info-label">Igreja/GC:</span>
        <span class="info-value">${churchName || '&nbsp;'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Culto:</span>
        <span class="info-value">${serviceName || '&nbsp;'}</span>
      </div>
      <div class="info-row-datetime">
        <div class="date-col">
          <span class="info-label">Realizado no dia:</span>
          <span class="date-boxes">${dStr} &nbsp;/&nbsp; ${mStr} &nbsp;/&nbsp; ${yStr}</span>
        </div>
        <div class="time-col">
          <span class="info-label">Horário:</span>
          <span class="time-box">${serviceTime || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>
        </div>
      </div>
    </section>

    <!-- FINANCIAL TABLE -->
    <section class="ata-table-card">
      <div class="table-row">
        <span class="row-label">Total em espécie</span>
        <div class="amount-pill">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(totalEspecieCents)}</span>
        </div>
      </div>

      <div class="table-row">
        <span class="row-label">Cartão de crédito/débito</span>
        <div class="amount-pill">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(totalCartaoCents)}</span>
        </div>
      </div>

      <div class="table-row">
        <span class="row-label">Transferência, Pix</span>
        <div class="amount-pill">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(totalPixCents)}</span>
        </div>
      </div>

      <div class="table-row">
        <span class="row-label bold">TOTAL GERAL</span>
        <div class="amount-pill bold">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(totalGeralCents)}</span>
        </div>
      </div>

      <div class="table-row" style="background:#fafafa; border-top:1.5px solid #1a2451;">
        <span class="row-label repasse-title">Repasse Convenção 10%</span>
        <div class="amount-pill bold">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(repasseConvencaoCents)}</span>
        </div>
      </div>

      <!-- CONTAS BANCÁRIAS -->
      <div class="contas-box">
        <div class="contas-title">Contas</div>
        <div class="contas-grid">
          <div class="conta-item">
            <strong>Santander</strong>
            <div>Ag 3040</div>
            <div>C/c 13006400-9</div>
          </div>
          <div class="conta-item">
            <strong>Itaú</strong>
            <div>Ag 0689 C/c 28748-0</div>
          </div>
          <div class="conta-item">
            <strong>Pix</strong>
            <div>393496930001-68</div>
          </div>
        </div>
      </div>

      <div class="table-row">
        <span class="row-label">Repasse Regional 5%</span>
        <div class="amount-pill">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(repasseRegionalCents)}</span>
        </div>
      </div>

      <div class="table-row" style="background:#f8fafc; border-top:1.5px solid #1a2451;">
        <span class="row-label bold">VALOR LÍQUIDO</span>
        <div class="amount-pill bold">
          <span class="currency">R$</span>
          <span>${formatMoneyPtBr(valorLiquidoCents)}</span>
        </div>
      </div>
    </section>

    <!-- SIGNATURES -->
    <section class="ata-participants-card">
      <div class="participants-title">PARTICIPANTES DA ATA DE REGISTRO</div>
      
      <div class="participant-row">
        <div class="participant-info">
          <span class="participant-role">Pastor:</span>
          <span class="participant-name">${pastor || '&nbsp;'}</span>
        </div>
        <div class="participant-sign">
          <span class="sign-label">Assinatura:</span>
          <div class="sign-line"></div>
        </div>
      </div>

      <div class="participant-row">
        <div class="participant-info">
          <span class="participant-role">Tesoureiro:</span>
          <span class="participant-name">${treasurer || '&nbsp;'}</span>
        </div>
        <div class="participant-sign">
          <span class="sign-label">Assinatura:</span>
          <div class="sign-line"></div>
        </div>
      </div>

      <div class="participant-row">
        <div class="participant-info">
          <span class="participant-role">Diácono:</span>
          <span class="participant-name">${deacon || '&nbsp;'}</span>
        </div>
        <div class="participant-sign">
          <span class="sign-label">Assinatura:</span>
          <div class="sign-line"></div>
        </div>
      </div>
    </section>

    ${includeAttachments ? `
      <!-- PAGE BREAK FOR NOTAS FISCAIS / COMPROVANTES -->
      <div class="page-break"></div>

      <div class="attachments-header" style="margin-top:20px;">
        <div>
          <h2>ANEXOS · NOTAS FISCAIS E COMPROVANTES DO PERÍODO</h2>
          <span>Período apurado: <strong>${periodLabel}</strong></span>
        </div>
        <span class="att-badge" style="background:#ffffff; color:#1a2451;">${attachments.length} anexo(s) anexado(s)</span>
      </div>

      ${attachments.length ? `
        <!-- RESUMO DOS COMPROVANTES -->
        <table class="att-table">
          <thead>
            <tr>
              <th>Documento / Ref</th>
              <th>Fornecedor / Credor</th>
              <th>Emissão / Data</th>
              <th>Centro de Custo</th>
              <th>Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            ${attachments.map(att => `
              <tr>
                <td><strong>${att.number || 'Recibo'}</strong><br><small style="color:#64748b;">${att.filename}</small></td>
                <td>${att.supplier}</td>
                <td>${formatDatePtBr(att.date)}</td>
                <td>${att.cost_center || 'Geral'}</td>
                <td><strong>R$ ${formatMoneyPtBr(att.amount_cents)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- VISUALIZAÇÃO DOS DOCUMENTOS ANEXOS -->
        ${attachments.map(att => `
          <div class="attachment-card">
            <div class="att-card-head">
              <div>
                <strong style="color:#0f172a; font-size:14.5px;">Documento: ${att.number || 'Comprovante'}</strong>
                <div style="color:#64748b; font-size:12.5px; margin-top:2px;">
                  Fornecedor: <strong>${att.supplier}</strong> · Emissão: <strong>${formatDatePtBr(att.date)}</strong> · Centro: <strong>${att.cost_center || 'Geral'}</strong>
                </div>
              </div>
              <div style="text-align:right;">
                <span style="font-size:16px; font-weight:800; color:#1a2451;">R$ ${formatMoneyPtBr(att.amount_cents)}</span>
                <div style="font-size:11.5px; color:#64748b;">${att.filename}</div>
              </div>
            </div>
            <div class="att-card-body">
              ${att.is_image ? `
                <img src="${att.data_url || ('/api/finance/files/' + att.file_id)}" alt="Nota Fiscal ${att.number}" />
              ` : att.is_pdf ? `
                <div style="text-align:left;">
                  <p style="margin-bottom:10px; font-size:13px; color:#475569;">
                    📄 Arquivo PDF: <strong>${att.filename}</strong> — 
                    <a href="/api/finance/files/${att.file_id}" target="_blank" rel="noopener" style="color:#1a2451; font-weight:700;">Abrir / Baixar PDF original ↗</a>
                  </p>
                  <iframe src="/api/finance/files/${att.file_id}#toolbar=0" style="width:100%; height:650px; border:1px solid #cbd5e1; border-radius:8px;"></iframe>
                </div>
              ` : `
                <p style="padding:20px; font-size:13px; color:#475569;">
                  📎 Arquivo (${att.filename}): <a href="/api/finance/files/${att.file_id}" target="_blank" rel="noopener">Visualizar / Baixar arquivo</a>
                </p>
              `}
            </div>
          </div>
        `).join('')}
      ` : `
        <div style="padding:30px; text-align:center; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; color:#64748b; margin-top:14px;">
          <p style="font-size:15px; font-weight:600; color:#334155; margin-bottom:6px;">Nenhum anexo de nota fiscal registrado no período selecionado.</p>
          <small>Ao cadastrar despesas e notas fiscais, anexe os comprovantes em imagem ou PDF para que sejam emitidos automaticamente junto a esta ATA.</small>
        </div>
      `}
    ` : ''}
  </main>

</body>
</html>`;
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        });
      }

      // === FINANCE FILES UPLOAD & DOWNLOAD ===
      if (path === '/api/finance/files' && method === 'POST') {
        const fd = await request.formData();
        const file = fd.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') fail('file', 'Selecione um arquivo válido.');
        const buf = Buffer.from(await file.arrayBuffer());
        const fid = randomBytes(16).toString('hex');
        await db.run(
          'INSERT INTO finance_files(id,filename,content_type,data,created_at) VALUES(?,?,?,?,?)',
          [fid, file.name || 'anexo.pdf', file.type || 'application/pdf', buf, nowIso()]
        );
        return jsonResp({ id: fid, url: '/api/finance/files/' + fid });
      }

      if (path.startsWith('/api/finance/files/') && method === 'GET') {
        const fid = path.split('/')[4];
        const row = await db.first('SELECT filename, content_type, data FROM finance_files WHERE id=?', [fid]);
        if (!row || !row.data) fail('missing', 'Anexo não encontrado.', 404);
        const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Buffer.from(row.data);
        return new Response(bytes, {
          status: 200,
          headers: { 'Content-Type': row.content_type || 'application/pdf', 'Cache-Control': 'private, max-age=3600' }
        });
      }

      // === KIDS CRUD & CHECK-IN ENDPOINTS ===
      if (path === '/api/children' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO children(name,birthday,room_id,parent_id,allergies,medical_conditions,emergency_medication,special_needs,authorized_pickups,created_at,archived) VALUES(?,?,?,?,?,?,?,?,?,?,0)',
          [
            String(body.name || '').trim(),
            body.birthday || body.birth_date || todayStr(),
            Number(body.room_id || 1),
            body.parent_id ? Number(body.parent_id) : user.id,
            encryptText(body.allergies || '', env),
            encryptText(body.medical_conditions || body.medical_notes || '', env),
            encryptText(body.emergency_medication || '', env),
            encryptText(body.special_needs || '', env),
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
        const status = body.status === 'present' ? 'present' : 'departed';
        const code = Array.from({ length: 4 }, () => CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)]).join('');
        if (status === 'present') {
          await db.run(
            "INSERT INTO attendance(child_id,day,status,in_at,guardian,actor,claim_code) VALUES(?,?,?,?,?,?,?) ON CONFLICT(child_id,day) DO UPDATE SET status=excluded.status, in_at=excluded.in_at, guardian=excluded.guardian, claim_code=coalesce(nullif(attendance.claim_code,''),excluded.claim_code)",
            [cid, day, 'present', nowIso(), body.guardian || user.name, user.id, code]
          );
        } else {
          await db.run(
            'UPDATE attendance SET status=?, out_at=?, checkout_guardian=? WHERE child_id=? AND day=?',
            ['departed', nowIso(), body.guardian || user.name, cid, day]
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
          'UPDATE children SET name=?, birthday=?, room_id=?, allergies=?, medical_conditions=?, authorized_pickups=? WHERE id=?',
          [
            body.name !== undefined ? String(body.name).trim() : old.name,
            body.birthday || body.birth_date || old.birthday,
            body.room_id ? Number(body.room_id) : old.room_id,
            body.allergies !== undefined ? encryptText(body.allergies, env) : old.allergies,
            (body.medical_conditions ?? body.medical_notes) !== undefined ? encryptText(body.medical_conditions ?? body.medical_notes, env) : old.medical_conditions,
            body.authorized_pickups !== undefined ? encryptText(body.authorized_pickups, env) : old.authorized_pickups,
            cid
          ]
        );
        return jsonResp({ ok: true, id: cid });
      }

      if (path === '/api/rooms' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO rooms(name,min_age,max_age,capacity,color,created_by,teacher_id,monitor_id,active) VALUES(?,?,?,?,?,?,?,?,1)',
          [String(body.name || '').trim(), Number(body.min_age || 0), Number(body.max_age || 12), Number(body.capacity || 20), body.color || '#4f46e5', user.id, body.teacher_id ? Number(body.teacher_id) : null, body.monitor_id ? Number(body.monitor_id) : null]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path === '/api/lessons' && method === 'POST') {
        const isMonitor = user.role === 'monitor' || user.staff_role === 'monitor';
        if (!isGlobal && user.role !== 'admin' && (user.role !== 'teacher' || isMonitor)) {
          fail('forbidden', 'Apenas professores e coordenação podem criar novas aulinhas.', 403);
        }
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO lessons(room_id,title,theme,memory_verse,starts_at,ends_at,created_by,teacher_id,monitor_id,materials_url,notes,family_question,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)',
          [
            Number(body.room_id || 1),
            String(body.title || '').trim(),
            body.theme || '',
            body.memory_verse || body.bible_verse || '',
            body.starts_at || nowIso(),
            body.ends_at || nowIso(),
            user.id,
            body.teacher_id ? Number(body.teacher_id) : user.id,
            body.monitor_id ? Number(body.monitor_id) : null,
            (body.materials_url || '').trim(),
            (body.notes || '').trim(),
            body.family_question || ''
          ]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path.startsWith('/api/lessons/') && path.endsWith('/curriculum') && method === 'GET') {
        const lid = Number(path.split('/')[3]);
        const lesson = await db.first('SELECT theme, memory_verse, family_question, materials_url, notes, monitor_status FROM lessons WHERE id=?', [lid]);
        if (!lesson) fail('missing', 'Aulinha não encontrada.', 404);
        return jsonResp(lesson);
      }

      if (path.startsWith('/api/lessons/') && path.endsWith('/curriculum') && method === 'POST') {
        const lid = Number(path.split('/')[3]);
        const isMonitor = user.role === 'monitor' || user.staff_role === 'monitor';
        if (!isGlobal && user.role !== 'admin' && (user.role !== 'teacher' || isMonitor)) {
          fail('forbidden', 'Apenas professores e coordenação podem configurar o discipulado e tema da aula.', 403);
        }
        const body = await request.json();
        await db.run('UPDATE lessons SET theme=?, memory_verse=?, family_question=? WHERE id=?', [
          body.theme || '',
          body.memory_verse || body.bible_verse || '',
          body.family_question || '',
          lid
        ]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/lessons/') && (path.endsWith('/presence-response') || path.endsWith('/monitor-response')) && method === 'POST') {
        const lid = Number(path.split('/')[3]);
        const lesson = await db.first('SELECT * FROM lessons WHERE id=?', [lid]);
        if (!lesson) fail('missing', 'Aulinha não encontrada.', 404);
        const canManage = isGlobal || user.role === 'admin' || user.role === 'teacher';
        if (!canManage && lesson.monitor_id !== user.id) {
          fail('forbidden', 'Você só pode responder escalas em que estiver vinculado como monitor.', 403);
        }
        const body = await request.json();
        const status = body.status === 'confirmed' ? 'confirmed' : 'declined';
        await db.run('UPDATE lessons SET monitor_status=? WHERE id=?', [status, lid]);
        return jsonResp({ ok: true, status });
      }

      if (path.startsWith('/api/lessons/') && path.endsWith('/presence') && method === 'POST') {
        const lid = Number(path.split('/')[3]);
        const body = await request.json();
        const cid = Number(body.child_id);
        if (!cid) fail('invalid', 'Aluno obrigatório.', 400);
        await db.run(
          'INSERT INTO reservations(lesson_id, child_id, confirmed, created_by, updated_at) VALUES(?,?,1,?,?) ON CONFLICT(lesson_id, child_id) DO UPDATE SET confirmed=1, updated_at=excluded.updated_at',
          [lid, cid, user.id, nowIso()]
        );
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/lessons/') && path.endsWith('/presence') && method === 'DELETE') {
        const lid = Number(path.split('/')[3]);
        const cid = Number(url.searchParams.get('child_id') || 0);
        await db.run('DELETE FROM reservations WHERE lesson_id=? AND child_id=?', [lid, cid]);
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/lessons/') && !path.includes('/', 14) && (method === 'PATCH' || method === 'PUT')) {
        const lid = Number(path.split('/')[3]);
        const isMonitor = user.role === 'monitor' || user.staff_role === 'monitor';
        if (!isGlobal && user.role !== 'admin' && (user.role !== 'teacher' || isMonitor)) {
          fail('forbidden', 'Apenas professores e coordenação podem editar aulinhas.', 403);
        }
        const body = await request.json();
        const old = await db.first('SELECT * FROM lessons WHERE id=?', [lid]);
        if (!old) fail('missing', 'Aulinha não encontrada.', 404);
        await db.run(
          'UPDATE lessons SET room_id=?, title=?, starts_at=?, ends_at=?, teacher_id=?, monitor_id=?, materials_url=?, notes=? WHERE id=?',
          [
            body.room_id ? Number(body.room_id) : old.room_id,
            body.title !== undefined ? String(body.title).trim() : old.title,
            body.starts_at || old.starts_at,
            body.ends_at || old.ends_at,
            body.teacher_id !== undefined ? (body.teacher_id ? Number(body.teacher_id) : null) : old.teacher_id,
            body.monitor_id !== undefined ? (body.monitor_id ? Number(body.monitor_id) : null) : old.monitor_id,
            body.materials_url !== undefined ? String(body.materials_url).trim() : old.materials_url,
            body.notes !== undefined ? String(body.notes).trim() : old.notes,
            lid
          ]
        );
        return jsonResp({ ok: true });
      }

      if (path.startsWith('/api/lessons/') && !path.includes('/', 14) && method === 'DELETE') {
        const lid = Number(path.split('/')[3]);
        const isMonitor = user.role === 'monitor' || user.staff_role === 'monitor';
        if (!isGlobal && user.role !== 'admin' && (user.role !== 'teacher' || isMonitor)) {
          fail('forbidden', 'Apenas professores e coordenação podem cancelar aulinhas.', 403);
        }
        await db.run('UPDATE lessons SET active=0 WHERE id=?', [lid]);
        return jsonResp({ ok: true });
      }

      if (path === '/api/events' && method === 'POST') {
        const body = await request.json();
        const ins = await db.run(
          'INSERT INTO events(title,category,description,location,starts_at,ends_at,max_capacity,price,target_audience,active,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)',
          [String(body.title || '').trim(), body.category || 'culto', body.description || '', body.location || 'Templo Lagoinha', body.starts_at || nowIso(), body.ends_at || nowIso(), Number(body.max_capacity || body.capacity || 100), String(body.price || 'Gratuito'), body.target_audience || 'all', user.id, nowIso()]
        );
        return jsonResp({ ok: true, id: ins.lastrowid });
      }

      if (path === '/api/guests/checkin' && method === 'POST') {
        const body = await request.json();
        const code = Array.from({ length: 4 }, () => CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)]).join('');
        const ins = await db.run(
          "INSERT INTO guest_checkins(child_name,child_age,guardian_name,guardian_phone,room_id,allergies,claim_code,status,actor,created_at) VALUES(?,?,?,?,?,?,?,'present',?,?)",
          [String(body.child_name || '').trim(), Number(body.child_age || 5), String(body.guardian_name || '').trim(), String(body.guardian_phone || '').trim(), Number(body.room_id || 1), encryptText(body.allergies || '', env), code, user.id, nowIso()]
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
