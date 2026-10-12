const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'scammers.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '9944191qqq';
const SAFEBASE_API_KEY = process.env.SAFEBASE_API_KEY || '';
const SESSIONS = new Map(); // token -> { expires }

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ========== DATABASE ==========
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('DB load error:', e.message);
  }
  return { scammers: [], reports: [], meta: { version: 1 } };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function loadComments() {
  try {
    if (fs.existsSync(COMMENTS_FILE)) {
      return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Comments load error:', e.message);
  }
  return {};
}

function saveComments(data) {
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getCommentsFor(username) {
  const all = loadComments();
  const u = normalizeUsername(username);
  return (all[u] || []).slice().reverse();
}


function seedIfEmpty() {
  const db = loadDB();
  if (db.scammers.length === 0) {
    const now = new Date().toISOString();
    db.scammers = [
      {
        id: crypto.randomUUID(),
        username: 'scammer_king',
        user_id: null,
        status: 'scam',
        reputation: 'Подтверждённый скамер',
        score: 8,
        reports: 47,
        warnings: 12,
        description: 'Многочисленные жалобы на обман при P2P-сделках и фейковые гарантии.',
        tags: ['P2P', 'Крипто', 'Фейк-гарант'],
        last_report: '2026-10-08',
        created_at: now,
        updated_at: now,
        added_by: 'system'
      },
      {
        id: crypto.randomUUID(),
        username: 'crypto_garant_fake',
        user_id: null,
        status: 'scam',
        reputation: 'Скамер',
        score: 12,
        reports: 31,
        warnings: 8,
        description: 'Выдаёт себя за гаранта. Забирает средства и блокирует.',
        tags: ['Гарант', 'Крипто'],
        last_report: '2026-10-05',
        created_at: now,
        updated_at: now,
        added_by: 'system'
      },
      {
        id: crypto.randomUUID(),
        username: 'nft_drop_scam',
        user_id: null,
        status: 'scam',
        reputation: 'Мошенник',
        score: 5,
        reports: 19,
        warnings: 5,
        description: 'Фейковые NFT-дропы. Просит seed-фразу «для верификации».',
        tags: ['NFT', 'Аирдроп', 'Seed'],
        last_report: '2026-09-28',
        created_at: now,
        updated_at: now,
        added_by: 'system'
      },
      {
        id: crypto.randomUUID(),
        username: 'support_tg_official',
        user_id: null,
        status: 'scam',
        reputation: 'Фейковая поддержка',
        score: 3,
        reports: 89,
        warnings: 22,
        description: 'Имитирует официальную поддержку. Запрашивает коды подтверждения.',
        tags: ['Фейк-саппорт', 'Фишинг'],
        last_report: '2026-10-09',
        created_at: now,
        updated_at: now,
        added_by: 'system'
      },
      {
        id: crypto.randomUUID(),
        username: 'trusted_trader',
        user_id: null,
        status: 'clean',
        reputation: 'Надёжный',
        score: 92,
        reports: 0,
        warnings: 0,
        description: 'Положительная история сделок. Нет жалоб.',
        tags: ['P2P', 'Проверен'],
        last_report: null,
        created_at: now,
        updated_at: now,
        added_by: 'system'
      },
      {
        id: crypto.randomUUID(),
        username: 'good_user',
        user_id: null,
        status: 'clean',
        reputation: 'Чистый',
        score: 88,
        reports: 0,
        warnings: 0,
        description: 'Нет негативных отметок.',
        tags: [],
        last_report: null,
        created_at: now,
        updated_at: now,
        added_by: 'system'
      }
    ];
    saveDB(db);
    console.log('Seeded database with demo scammers');
  }
}

seedIfEmpty();

// ========== HELPERS ==========
function normalizeUsername(u) {
  if (!u) return '';
  return String(u).trim().replace(/^@/, '').toLowerCase();
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function createToken() {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, { expires: Date.now() + 24 * 60 * 60 * 1000 });
  return token;
}

function isValidToken(token) {
  if (!token) return false;
  const s = SESSIONS.get(token);
  if (!s) return false;
  if (Date.now() > s.expires) {
    SESSIONS.delete(token);
    return false;
  }
  return true;
}

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-admin-token'] || '';
}

function requireAdmin(req, res) {
  const token = getToken(req);
  if (!isValidToken(token)) {
    sendJSON(res, 401, { success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function findByUsername(db, username) {
  const u = normalizeUsername(username);
  return db.scammers.find(s => normalizeUsername(s.username) === u);
}

function findByUserId(db, userId) {
  if (!userId) return null;
  const id = String(userId);
  return db.scammers.find(s => s.user_id && String(s.user_id) === id);
}

const SUSPICIOUS_PATTERNS = [
  { pattern: /garant|гарант|support|саппорт|official|официал/i, boost: -25 },
  { pattern: /free|airdrop|drop|giveaway|раздача/i, boost: -15 },
  { pattern: /admin|мод|moderator/i, boost: -10 }
];

function heuristicScore(username) {
  let score = 75;
  for (const { pattern, boost } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(username)) score += boost;
  }
  const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  score += (hash % 21) - 10;
  return Math.max(0, Math.min(100, score));
}

function statusByScore(score) {
  if (score <= 25) return 'scam';
  if (score <= 55) return 'suspicious';
  return 'clean';
}

// SafeBase integration
async function checkSafeBase(userId) {
  if (!SAFEBASE_API_KEY || !userId) return null;
  try {
    const https = require('https');
    return await new Promise((resolve) => {
      const req = https.request({
        hostname: 'safebase.site',
        path: '/api/check/' + encodeURIComponent(userId),
        method: 'POST',
        headers: { 'api-key': SAFEBASE_API_KEY, 'Content-Type': 'application/json' },
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
  } catch {
    return null;
  }
}

function mapSafeBase(sb) {
  if (!sb || !sb.exists) return null;
  const status = sb.status === 'scam' ? 'scam' :
                 sb.status === 'garant' || sb.status === 'admin' ? 'clean' : 'suspicious';
  return {
    status,
    reputation: sb.reputation || (status === 'scam' ? 'Скамер (SafeBase)' : 'SafeBase'),
    score: status === 'scam' ? 10 : status === 'clean' ? 90 : 50,
    reports: sb.search_count || 0,
    warnings: sb.warnings || 0,
    description: sb.description || '',
    source: 'safebase',
    checked_at: sb.checked_at || new Date().toISOString()
  };
}

// ========== SERVER ==========
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token'
    });
    return res.end();
  }

  // ---- Health ----
  if (pathname === '/api/health') {
    const db = loadDB();
    return sendJSON(res, 200, {
      status: 'ok',
      time: new Date().toISOString(),
      scammers_count: db.scammers.length,
      safebase: !!SAFEBASE_API_KEY
    });
  }

  // ---- Public check ----
  if (pathname === '/api/check' && method === 'GET') {
    const rawUser = parsed.query.username || parsed.query.u || '';
    const rawId = parsed.query.user_id || parsed.query.id || '';
    const username = normalizeUsername(rawUser);
    const userId = rawId ? String(rawId).trim() : '';

    if ((!username || username.length < 3) && !userId) {
      return sendJSON(res, 400, {
        success: false,
        error: 'Укажите username (от 3 символов) или user_id'
      });
    }

    await new Promise(r => setTimeout(r, 300 + Math.random() * 250));

    const db = loadDB();
    let known = null;
    if (username) known = findByUsername(db, username);
    if (!known && userId) known = findByUserId(db, userId);

    // Optional SafeBase
    let safebaseResult = null;
    if (userId && SAFEBASE_API_KEY) {
      const sb = await checkSafeBase(userId);
      safebaseResult = mapSafeBase(sb);
    }

    let result;
    if (known) {
      result = {
        success: true,
        username: known.username ? '@' + known.username : null,
        user_id: known.user_id || userId || null,
        status: known.status,
        reputation: known.reputation,
        score: known.score,
        reports: known.reports,
        warnings: known.warnings,
        description: known.description,
        last_report: known.last_report,
        tags: known.tags || [],
        checked_at: new Date().toISOString(),
        source: 'local_db',
        safebase: safebaseResult
      };
      // If SafeBase says scam and local is clean, escalate
      if (safebaseResult && safebaseResult.status === 'scam' && known.status !== 'scam') {
        result.status = 'scam';
        result.reputation = safebaseResult.reputation;
        result.score = Math.min(result.score, safebaseResult.score);
        result.source = 'local_db+safebase';
      }
    } else if (safebaseResult) {
      result = {
        success: true,
        username: username ? '@' + username : null,
        user_id: userId || null,
        status: safebaseResult.status,
        reputation: safebaseResult.reputation,
        score: safebaseResult.score,
        reports: safebaseResult.reports,
        warnings: safebaseResult.warnings,
        description: safebaseResult.description || 'Данные из SafeBase',
        last_report: null,
        tags: [],
        checked_at: new Date().toISOString(),
        source: 'safebase'
      };
    } else if (username) {
      const score = heuristicScore(username);
      const status = statusByScore(score);
      result = {
        success: true,
        username: '@' + username,
        user_id: userId || null,
        status,
        reputation: status === 'scam' ? 'Высокий риск' :
                    status === 'suspicious' ? 'Подозрительно' : 'Низкий риск',
        score,
        reports: status === 'scam' ? Math.floor(Math.random() * 5) + 1 : 0,
        warnings: status === 'suspicious' ? Math.floor(Math.random() * 2) + 1 : 0,
        description: status === 'scam'
          ? 'Обнаружены признаки мошеннической активности по паттернам.'
          : status === 'suspicious'
          ? 'Username содержит подозрительные ключевые слова. Будьте осторожны.'
          : 'В локальной базе негативных отметок не найдено. Это не гарантия безопасности.',
        last_report: null,
        tags: [],
        checked_at: new Date().toISOString(),
        source: 'heuristic'
      };
    } else {
      result = {
        success: true,
        username: null,
        user_id: userId,
        status: 'clean',
        reputation: 'Нет данных',
        score: 70,
        reports: 0,
        warnings: 0,
        description: 'Пользователь не найден в локальной базе. SafeBase не настроен или не ответил.',
        last_report: null,
        tags: [],
        checked_at: new Date().toISOString(),
        source: 'none'
      };
    }

    // attach community comments
    const uname = (result.username || '').replace(/^@/, '') || username;
    if (uname) {
      result.comments = getCommentsFor(uname);
    } else {
      result.comments = [];
    }
    return sendJSON(res, 200, result);
  }

  // ---- Public report ----
  if (pathname === '/api/report' && method === 'POST') {
    try {
      const data = await readBody(req);
      const u = normalizeUsername(data.username);
      if (!u) return sendJSON(res, 400, { success: false, error: 'Username required' });
      const db = loadDB();
      db.reports = db.reports || [];
      db.reports.push({
        id: crypto.randomUUID(),
        username: u,
        user_id: data.user_id || null,
        reason: data.reason || '',
        created_at: new Date().toISOString()
      });
      // auto-bump if exists
      const existing = findByUsername(db, u);
      if (existing) {
        existing.reports = (existing.reports || 0) + 1;
        existing.warnings = (existing.warnings || 0) + 1;
        existing.last_report = new Date().toISOString().slice(0, 10);
        existing.updated_at = new Date().toISOString();
        if (existing.status === 'clean' && existing.reports >= 3) {
          existing.status = 'suspicious';
          existing.score = Math.min(existing.score, 45);
          existing.reputation = 'Подозрительно (жалобы)';
        }
      }
      saveDB(db);
      console.log('[REPORT]', u, data.reason || '');
      return sendJSON(res, 200, { success: true, message: 'Жалоба принята и будет рассмотрена.' });
    } catch (e) {
      return sendJSON(res, 400, { success: false, error: e.message });
    }
  }

  // ---- Admin login ----
  if (pathname === '/api/admin/login' && method === 'POST') {
    try {
      const data = await readBody(req);
      if (data.password === ADMIN_PASSWORD) {
        const token = createToken();
        return sendJSON(res, 200, { success: true, token, expires_in: 86400 });
      }
      return sendJSON(res, 401, { success: false, error: 'Неверный пароль' });
    } catch {
      return sendJSON(res, 400, { success: false, error: 'Invalid request' });
    }
  }

  // ---- Admin: list scammers ----
  if (pathname === '/api/admin/scammers' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const db = loadDB();
    const q = (parsed.query.q || '').toLowerCase();
    let list = db.scammers;
    if (q) {
      list = list.filter(s =>
        (s.username || '').includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        String(s.user_id || '').includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    const statusFilter = parsed.query.status;
    if (statusFilter) list = list.filter(s => s.status === statusFilter);
    list = list.slice().sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    return sendJSON(res, 200, { success: true, total: list.length, scammers: list });
  }

  // ---- Admin: add scammer ----
  if (pathname === '/api/admin/scammers' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const data = await readBody(req);
      const username = normalizeUsername(data.username);
      if (!username || username.length < 3) {
        return sendJSON(res, 400, { success: false, error: 'Username обязателен (мин. 3 символа)' });
      }
      const db = loadDB();
      if (findByUsername(db, username)) {
        return sendJSON(res, 409, { success: false, error: 'Такой username уже есть в базе' });
      }
      const now = new Date().toISOString();
      const status = data.status || 'scam';
      const entry = {
        id: crypto.randomUUID(),
        username,
        user_id: data.user_id ? String(data.user_id) : null,
        status,
        reputation: data.reputation || (status === 'scam' ? 'Скамер' : status === 'clean' ? 'Чистый' : 'Подозрительно'),
        score: typeof data.score === 'number' ? data.score : (status === 'scam' ? 10 : status === 'clean' ? 85 : 45),
        reports: data.reports || 0,
        warnings: data.warnings || 0,
        description: data.description || '',
        tags: Array.isArray(data.tags) ? data.tags : (data.tags ? String(data.tags).split(',').map(t => t.trim()).filter(Boolean) : []),
        last_report: data.last_report || null,
        created_at: now,
        updated_at: now,
        added_by: 'admin'
      };
      db.scammers.push(entry);
      saveDB(db);
      return sendJSON(res, 201, { success: true, scammer: entry });
    } catch (e) {
      return sendJSON(res, 400, { success: false, error: e.message });
    }
  }

  // ---- Admin: update scammer ----
  if (pathname.startsWith('/api/admin/scammers/') && method === 'PUT') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/').pop();
    try {
      const data = await readBody(req);
      const db = loadDB();
      const idx = db.scammers.findIndex(s => s.id === id);
      if (idx === -1) return sendJSON(res, 404, { success: false, error: 'Не найден' });
      const s = db.scammers[idx];
      if (data.username !== undefined) s.username = normalizeUsername(data.username);
      if (data.user_id !== undefined) s.user_id = data.user_id ? String(data.user_id) : null;
      if (data.status !== undefined) s.status = data.status;
      if (data.reputation !== undefined) s.reputation = data.reputation;
      if (data.score !== undefined) s.score = Number(data.score);
      if (data.reports !== undefined) s.reports = Number(data.reports);
      if (data.warnings !== undefined) s.warnings = Number(data.warnings);
      if (data.description !== undefined) s.description = data.description;
      if (data.tags !== undefined) {
        s.tags = Array.isArray(data.tags) ? data.tags : String(data.tags).split(',').map(t => t.trim()).filter(Boolean);
      }
      if (data.last_report !== undefined) s.last_report = data.last_report;
      s.updated_at = new Date().toISOString();
      saveDB(db);
      return sendJSON(res, 200, { success: true, scammer: s });
    } catch (e) {
      return sendJSON(res, 400, { success: false, error: e.message });
    }
  }

  // ---- Admin: delete scammer ----
  if (pathname.startsWith('/api/admin/scammers/') && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/').pop();
    const db = loadDB();
    const idx = db.scammers.findIndex(s => s.id === id);
    if (idx === -1) return sendJSON(res, 404, { success: false, error: 'Не найден' });
    const removed = db.scammers.splice(idx, 1)[0];
    saveDB(db);
    return sendJSON(res, 200, { success: true, removed });
  }

  // ---- Admin: reports list ----
  if (pathname === '/api/admin/reports' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const db = loadDB();
    const reports = (db.reports || []).slice().reverse().slice(0, 100);
    return sendJSON(res, 200, { success: true, total: reports.length, reports });
  }

  // ---- Admin: stats ----
  if (pathname === '/api/admin/stats' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const db = loadDB();
    const byStatus = { scam: 0, suspicious: 0, clean: 0 };
    db.scammers.forEach(s => { byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
    return sendJSON(res, 200, {
      success: true,
      total: db.scammers.length,
      by_status: byStatus,
      reports_count: (db.reports || []).length,
      safebase_enabled: !!SAFEBASE_API_KEY
    });
  }


  // ---- Public comments ----
  if (pathname === '/api/comments' && method === 'GET') {
    const username = normalizeUsername(parsed.query.username || '');
    if (!username) return sendJSON(res, 400, { success: false, error: 'username required' });
    const comments = getCommentsFor(username);
    return sendJSON(res, 200, { success: true, username: '@' + username, total: comments.length, comments });
  }

  if (pathname === '/api/comments' && method === 'POST') {
    try {
      const data = await readBody(req);
      const username = normalizeUsername(data.username);
      const text = String(data.text || '').trim();
      if (!username || username.length < 3) {
        return sendJSON(res, 400, { success: false, error: 'username required' });
      }
      if (!text || text.length < 3) {
        return sendJSON(res, 400, { success: false, error: 'Текст отчёта слишком короткий (мин. 3 символа)' });
      }
      if (text.length > 500) {
        return sendJSON(res, 400, { success: false, error: 'Максимум 500 символов' });
      }
      const author = String(data.author || 'Anonymous').trim().slice(0, 32) || 'Anonymous';
      const all = loadComments();
      if (!all[username]) all[username] = [];
      // rate limit: max 3 per username from same rough session - skip for simplicity
      if (all[username].length >= 100) {
        return sendJSON(res, 400, { success: false, error: 'Слишком много отчётов на этого пользователя' });
      }
      all[username].push({
        id: crypto.randomUUID(),
        author,
        text,
        created_at: new Date().toISOString()
      });
      saveComments(all);

      // bump reports on local entry if exists
      const db = loadDB();
      const existing = findByUsername(db, username);
      if (existing) {
        existing.reports = (existing.reports || 0) + 1;
        existing.last_report = new Date().toISOString().slice(0, 10);
        existing.updated_at = new Date().toISOString();
        if (existing.status === 'clean' && existing.reports >= 3) {
          existing.status = 'suspicious';
          existing.score = Math.min(existing.score, 45);
          existing.reputation = 'Подозрительно (отчёты сообщества)';
        }
        saveDB(db);
      }

      const comments = getCommentsFor(username);
      return sendJSON(res, 201, { success: true, comments });
    } catch (e) {
      return sendJSON(res, 400, { success: false, error: e.message });
    }
  }

  // ---- Static / Admin UI ----
  if (pathname === '/admin' || pathname === '/admin/') {
    return sendFile(res, path.join(PUBLIC, 'admin', 'index.html'));
  }

  let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }

  // SPA fallback for main app
  if (!pathname.startsWith('/api')) {
    return sendFile(res, path.join(PUBLIC, 'index.html'));
  }

  sendJSON(res, 404, { success: false, error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Detected Scams running on http://0.0.0.0:' + PORT);
  console.log('Admin panel: /admin  (password: ' + (process.env.ADMIN_PASSWORD ? '***' : '9944191qqq') + ')');
  console.log('SafeBase: ' + (SAFEBASE_API_KEY ? 'enabled' : 'disabled (set SAFEBASE_API_KEY)'));
});
