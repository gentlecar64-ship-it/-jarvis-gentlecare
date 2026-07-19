'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { URL } = require('node:url');
const localStore = require('./local-store');
const jarvis = require('./jarvis-extended');
const quoteWorkflow = require('./quote-workflow');
const clientIntake = require('./client-intake');
const reputation = require('./reputation');
const backup = require('./backup');
const auth = require('./auth');
const updater = require('./updater');
const airtableSync = require('./airtable-sync');
const insightsStore = require('./insights-store');
const diagnostics = require('./diagnostics');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.GCOS_PORT || 4782);
const HOST = process.env.GCOS_HOST || '0.0.0.0';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app6i45G4WG2nmQff';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || '';
const ALLOWED_ORIGIN = process.env.GCOS_ALLOWED_ORIGIN || '*';
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOCAL_COLLECTIONS = new Set(['clients', 'vehicles', 'interventions', 'observations', 'communications', 'tasks', 'stockItems', 'quotes', 'documents', 'photos']);
const diagnosticDependencies = { localStore, airtableSync, updater, backup };

function commonHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GCOS-Session, X-GCOS-Client, X-GCOS-Device-ID',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'User-Agent, X-GCOS-Client, X-GCOS-Device-ID',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer'
  };
}

function json(res, status, body, extraHeaders = {}) { res.writeHead(status, { ...commonHeaders('application/json; charset=utf-8'), ...extraHeaders }); res.end(JSON.stringify(body)); }
function html(res, status, body) { res.writeHead(status, commonHeaders('text/html; charset=utf-8')); res.end(body); }
function redirect(res, location) { res.writeHead(302, { Location: location, ...commonHeaders('text/plain; charset=utf-8') }); res.end(); }
function binary(res, status, content, type) { res.writeHead(status, commonHeaders(type)); res.end(content); }
function sessionCookie(token) { return `gcos_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(auth.SESSION_TTL_MS / 1000)}`; }
function clearSessionCookie() { return 'gcos_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'; }

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.svg': 'image/svg+xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' })[ext] || 'application/octet-stream';
}
function servePublicAsset(res, relativePath) {
  let clean;
  try { clean = decodeURIComponent(String(relativePath || '')).replace(/^\/+/, ''); }
  catch { return json(res, 400, { error: 'ASSET_PATH_INVALID' }); }
  const target = path.resolve(PUBLIC_DIR, clean);
  const root = `${path.resolve(PUBLIC_DIR)}${path.sep}`;
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, { error: 'ASSET_NOT_FOUND' });
  return binary(res, 200, fs.readFileSync(target), contentType(target));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000_000) throw Object.assign(new Error('GCOS_BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('GCOS_INVALID_JSON'), { status: 400 }); }
}

function requireAirtable(res) {
  if (AIRTABLE_TOKEN) return true;
  json(res, 503, { error: 'AIRTABLE_NOT_CONFIGURED' });
  return false;
}

async function airtableRequest(table, options = {}) {
  const recordSuffix = options.recordId ? `/${encodeURIComponent(options.recordId)}` : '';
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${recordSuffix}`);
  Object.entries(options.query || {}).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `AIRTABLE_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timer); }
}

const AUTH_BOOTSTRAP = `<script>(function(){const device=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'iphone':'pc';let deviceId=localStorage.getItem('gcos_device_id');if(!deviceId){deviceId=(window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():'dev-'+Date.now()+'-'+Math.random().toString(16).slice(2));localStorage.setItem('gcos_device_id',deviceId);}const token=localStorage.getItem('gcos_session');const login=()=>location.replace('/login?next='+encodeURIComponent(location.pathname));const original=window.fetch;window.fetch=function(input,init){init=init||{};const headers=new Headers(init.headers||{});if(token)headers.set('Authorization','Bearer '+token);headers.set('X-GCOS-Client',device);headers.set('X-GCOS-Device-ID',deviceId);return original(input,{...init,cache:'no-store',headers,credentials:'same-origin'}).then(function(r){if(r.status===401){localStorage.removeItem('gcos_session');login();}return r;});};})();</script>`;

function servePage(res, fileName, missingMessage, protect = false) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(filePath)) return html(res, 404, `<h1>${missingMessage}</h1>`);
  let content = fs.readFileSync(filePath, 'utf8');
  if (protect) content = content.replace('<head>', `<head>${AUTH_BOOTSTRAP}`);
  if (fileName === 'jarvis.html') content = content.replace('</body>', `<script src="/assets/jarvis-quote.js?v=${encodeURIComponent(updater.currentVersion())}"></script></body>`);
  if (protect) content = content.replace('</body>', `<script src="/assets/reputation-client.js?v=${encodeURIComponent(updater.currentVersion())}"></script></body>`);
  return html(res, 200, content);
}

function requireUser(req) {
  const user = auth.authenticate(req);
  if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  return user;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (req.method === 'GET' && url.pathname === '/login') return servePage(res, 'login.html', 'Connexion introuvable');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, {
      service: 'MAVIK GCOS', version: updater.currentVersion(), multiUser: true, device: auth.deviceFromRequest(req), setupRequired: auth.setupRequired(),
      airtableConfigured: Boolean(AIRTABLE_TOKEN), airtableSync: airtableSync.status(), insights: insightsStore.status(), updater: updater.state(),
      diagnostics: diagnostics.readLastReport(), quoteWorkflow: { enabled: true, depositRate: quoteWorkflow.DEPOSIT_RATE }, reputation: { enabled: true }, host: HOST, uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString()
    });
    if (req.method === 'GET' && url.pathname === '/api/auth/status') return json(res, 200, { setupRequired: auth.setupRequired(), device: auth.deviceFromRequest(req), user: auth.authenticate(req) });
    if (req.method === 'POST' && url.pathname === '/api/auth/setup') {
      const body = await readBody(req);
      const context = auth.deviceContextFromRequest(req);
      return json(res, 201, { user: auth.createInitialAdmin(body, context), device: context.type });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      const result = auth.login(body.username, body.password, auth.deviceContextFromRequest(req));
      return json(res, 200, result, { 'Set-Cookie': sessionCookie(result.token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      auth.logout(auth.tokenFromRequest(req));
      return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    }

    const protectedPages = ['/', '/alpha', '/iphone', '/jarvis', '/profile'];
    if (req.method === 'GET' && protectedPages.includes(url.pathname) && !auth.authenticate(req)) {
      return redirect(res, `/login?next=${encodeURIComponent(url.pathname === '/' ? (auth.deviceFromRequest(req) === 'iphone' ? '/iphone' : '/alpha') : url.pathname)}`);
    }
    const user = requireUser(req);
    const context = auth.deviceContextFromRequest(req);

    if (req.method === 'GET' && url.pathname === '/assets/jarvis-quote.js') return servePublicAsset(res, 'jarvis-quote.js');
    if (req.method === 'GET' && url.pathname === '/assets/reputation-client.js') return servePublicAsset(res, 'reputation-client.js');
    if (req.method === 'GET' && url.pathname.startsWith('/generated/')) return servePublicAsset(res, url.pathname);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/alpha' || url.pathname === '/iphone')) return servePage(res, 'alpha.html', 'MAVIK GCOS introuvable', true);
    if (req.method === 'GET' && url.pathname === '/jarvis') { auth.requirePermission(user, 'jarvis.use'); return servePage(res, 'jarvis.html', 'Jarvis introuvable', true); }
    if (req.method === 'GET' && url.pathname === '/profile') return servePage(res, 'profile.html', 'Profil MAVIK introuvable', true);
    if (req.method === 'GET' && url.pathname === '/api/auth/me') return json(res, 200, { user, device: context.type, deviceContext: context });

    if (req.method === 'GET' && url.pathname === '/api/profile') return json(res, 200, { user, design: { locked: true, version: auth.DESIGN_LOCK } });
    if (req.method === 'PATCH' && url.pathname === '/api/profile') return json(res, 200, { user: auth.updateMyProfile(user, await readBody(req), context) });
    if (req.method === 'POST' && (url.pathname === '/api/profile/pin' || url.pathname === '/api/auth/pin')) {
      const result = auth.changeMyPin(user, await readBody(req));
      return json(res, 200, result, { 'Set-Cookie': clearSessionCookie() });
    }
    if (req.method === 'POST' && url.pathname === '/api/profile/devices/revoke') {
      const body = await readBody(req);
      return json(res, 200, { user: auth.revokeTrustedDevice(user, body.deviceId, context) });
    }

    if (req.method === 'GET' && url.pathname === '/api/reputation/preferences') return json(res, 200, { settings: reputation.getUserSettings(user) });
    if (req.method === 'PATCH' && url.pathname === '/api/reputation/preferences') return json(res, 200, { settings: reputation.saveUserSettings(user, await readBody(req)) });
    if (req.method === 'GET' && url.pathname === '/api/reputation/prompt') return json(res, 200, reputation.buildPrompt(user, { force: url.searchParams.get('force') === '1' }));
    if (req.method === 'POST' && url.pathname === '/api/reputation/respond') return json(res, 200, reputation.respond(user, await readBody(req)));

    if (req.method === 'GET' && url.pathname === '/api/clients/lookup') {
      auth.requirePermission(user, 'clients.read');
      return json(res, 200, clientIntake.lookup(localStore, url.searchParams.get('q') || ''));
    }

    if (req.method === 'GET' && url.pathname === '/api/users') return json(res, 200, { users: auth.listUsers(user), roles: auth.ROLE_PERMISSIONS });
    if (req.method === 'POST' && url.pathname === '/api/users') return json(res, 201, { user: auth.createUser(user, await readBody(req)) });

    if (req.method === 'POST' && url.pathname === '/api/quotes/intake') {
      auth.requirePermission(user, 'quotes.write');
      return json(res, 201, quoteWorkflow.startIntake(localStore, { ...(await readBody(req)), user }));
    }
    const quoteRoute = url.pathname.match(/^\/api\/quotes\/([^/]+)$/);
    if (quoteRoute && req.method === 'GET') {
      auth.requirePermission(user, 'quotes.read');
      const quote = quoteWorkflow.resolveQuote(localStore, decodeURIComponent(quoteRoute[1]));
      if (!quote) return json(res, 404, { error: 'QUOTE_NOT_FOUND' });
      return json(res, 200, { quote });
    }
    const quoteRegenerateRoute = url.pathname.match(/^\/api\/quotes\/([^/]+)\/regenerate$/);
    if (quoteRegenerateRoute && req.method === 'POST') {
      auth.requirePermission(user, 'quotes.write');
      return json(res, 200, quoteWorkflow.regenerate(localStore, decodeURIComponent(quoteRegenerateRoute[1]), await readBody(req), user));
    }
    const quoteTransitionRoute = url.pathname.match(/^\/api\/quotes\/([^/]+)\/transition$/);
    if (quoteTransitionRoute && req.method === 'POST') {
      auth.requirePermission(user, 'quotes.write');
      const body = await readBody(req);
      const result = quoteWorkflow.transition(localStore, decodeURIComponent(quoteTransitionRoute[1]), body.action, body, user);
      if (body.action === 'close') result.data.reputation = reputation.scheduleClientReview(localStore, result.data.quote, user);
      return json(res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/api/system/diagnostics') { auth.requirePermission(user, 'dashboard.read'); return json(res, 200, diagnostics.readLastReport() || await diagnostics.run(diagnosticDependencies)); }
    if (req.method === 'POST' && url.pathname === '/api/system/diagnostics/repair') {
      auth.requirePermission(user, 'users.manage');
      const report = await diagnostics.run(diagnosticDependencies, { repair: true });
      json(res, 200, report);
      setTimeout(() => updater.automaticCycle().catch((error) => diagnostics.recordCrash(error, 'AUTO_UPDATE_TEST')), 1200).unref();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/system/update') { auth.requirePermission(user, 'users.manage'); return json(res, 200, updater.state()); }
    if (req.method === 'POST' && url.pathname === '/api/system/update/check') { auth.requirePermission(user, 'users.manage'); return json(res, 200, await updater.check()); }
    if (req.method === 'POST' && url.pathname === '/api/system/update/download') { auth.requirePermission(user, 'users.manage'); backup.createBackup(); return json(res, 200, await updater.download()); }
    if (req.method === 'POST' && url.pathname === '/api/system/update/cancel') { auth.requirePermission(user, 'users.manage'); return json(res, 200, updater.clearPending()); }

    if (req.method === 'GET' && url.pathname === '/api/insights/status') { auth.requirePermission(user, 'users.manage'); return json(res, 200, insightsStore.status()); }
    if (req.method === 'POST' && url.pathname === '/api/insights/events') {
      auth.requirePermission(user, 'jarvis.use');
      const result = insightsStore.appendBatch((await readBody(req)).events, user);
      return json(res, 202, { ...result, stored: insightsStore.status().storedEvents });
    }

    if (req.method === 'GET' && url.pathname === '/api/sync/status') { auth.requirePermission(user, 'dashboard.read'); return json(res, 200, airtableSync.status()); }
    if (req.method === 'POST' && url.pathname === '/api/sync/test') { auth.requirePermission(user, 'dashboard.read'); return json(res, 200, await airtableSync.testConnection()); }
    if (req.method === 'POST' && url.pathname === '/api/sync/push-all') {
      auth.requirePermission(user, 'users.manage');
      const body = await readBody(req);
      return json(res, 200, await airtableSync.pushAll(localStore, Array.isArray(body.collections) ? body.collections : undefined));
    }
    const syncRecordMatch = url.pathname.match(/^\/api\/sync\/([^/]+)\/([^/]+)$/);
    if (syncRecordMatch && req.method === 'POST') {
      const collection = decodeURIComponent(syncRecordMatch[1]);
      const id = decodeURIComponent(syncRecordMatch[2]);
      auth.requirePermission(user, auth.collectionPermission(collection, 'PATCH'));
      const record = localStore.list(collection).find((item) => item.id === id);
      if (!record) return json(res, 404, { error: 'GCOS_RECORD_NOT_FOUND' });
      return json(res, 200, await airtableSync.push(collection, record, localStore));
    }

    if (req.method === 'GET' && url.pathname === '/api/jarvis/brief') { auth.requirePermission(user, 'jarvis.use'); return json(res, 200, jarvis.brief(localStore, user)); }
    if (req.method === 'GET' && url.pathname === '/api/jarvis/knowledge') { auth.requirePermission(user, 'jarvis.use'); return json(res, 200, jarvis.knowledge); }
    if (req.method === 'POST' && url.pathname === '/api/jarvis/command') { auth.requirePermission(user, 'jarvis.use'); return json(res, 200, jarvis.execute(localStore, { ...(await readBody(req)), user })); }
    if (req.method === 'POST' && url.pathname === '/api/system/backup') { auth.requirePermission(user, 'users.manage'); return json(res, 201, { path: backup.createBackup() }); }
    if (req.method === 'GET' && url.pathname === '/api/local/summary') { auth.requirePermission(user, 'dashboard.read'); return json(res, 200, localStore.summary()); }

    const localRecordMatch = url.pathname.match(/^\/api\/local\/([^/]+)\/([^/]+)$/);
    if (localRecordMatch && req.method === 'PATCH') {
      const collection = decodeURIComponent(localRecordMatch[1]);
      if (!LOCAL_COLLECTIONS.has(collection)) return json(res, 404, { error: 'GCOS_COLLECTION_NOT_FOUND' });
      auth.requirePermission(user, auth.collectionPermission(collection, req.method));
      return json(res, 200, localStore.update(collection, decodeURIComponent(localRecordMatch[2]), { ...(await readBody(req)), updatedBy: user.id, updatedByName: user.name }));
    }

    const localCollectionMatch = url.pathname.match(/^\/api\/local\/([^/]+)$/);
    if (localCollectionMatch) {
      const collection = decodeURIComponent(localCollectionMatch[1]);
      if (!LOCAL_COLLECTIONS.has(collection)) return json(res, 404, { error: 'GCOS_COLLECTION_NOT_FOUND' });
      auth.requirePermission(user, auth.collectionPermission(collection, req.method));
      if (req.method === 'GET') return json(res, 200, { records: localStore.list(collection) });
      if (req.method === 'POST') return json(res, 201, localStore.create(collection, { ...(await readBody(req)), createdBy: user.id, createdByName: user.name }));
    }

    const recordMatch = url.pathname.match(/^\/api\/airtable\/tables\/([^/]+)\/([^/]+)$/);
    if (recordMatch && req.method === 'PATCH') {
      auth.requirePermission(user, 'interventions.write');
      if (!requireAirtable(res)) return;
      return json(res, 200, await airtableRequest(decodeURIComponent(recordMatch[1]), { method: 'PATCH', recordId: decodeURIComponent(recordMatch[2]), body: await readBody(req) }));
    }

    const tableMatch = url.pathname.match(/^\/api\/airtable\/tables\/([^/]+)$/);
    if (tableMatch && req.method === 'GET') {
      auth.requirePermission(user, 'dashboard.read');
      if (!requireAirtable(res)) return;
      return json(res, 200, await airtableRequest(decodeURIComponent(tableMatch[1]), { query: { maxRecords: url.searchParams.get('maxRecords') || 50, view: url.searchParams.get('view') || undefined, filterByFormula: url.searchParams.get('filterByFormula') || undefined } }));
    }
    if (tableMatch && req.method === 'POST') {
      auth.requirePermission(user, 'interventions.write');
      if (!requireAirtable(res)) return;
      return json(res, 201, await airtableRequest(decodeURIComponent(tableMatch[1]), { method: 'POST', body: await readBody(req) }));
    }

    return json(res, 404, { error: 'GCOS_ROUTE_NOT_FOUND' });
  } catch (error) {
    diagnostics.recordCrash(error, 'REQUEST');
    console.error('[GCOS]', error);
    return json(res, error.status || 500, { error: error.message || 'GCOS_INTERNAL_ERROR' });
  }
});

backup.startAutomaticBackups();
updater.startAutomaticChecks();
diagnostics.startAutomaticChecks(diagnosticDependencies);
server.listen(PORT, HOST, () => {
  console.log(`MAVIK GCOS ${updater.currentVersion()} started on http://${HOST}:${PORT}`);
  console.log('Multi-user authentication: one PIN per user on all trusted devices');
  console.log('Voice quote workflow: enabled, visual draft and 50% deposit rule active');
  console.log('Reputation workflow: profile prompts and client review drafts enabled');
  console.log(`Airtable synchronization: ${airtableSync.configured() ? 'enabled' : 'disabled'}`);
  console.log(`Mavik Insights: enabled (${insightsStore.status().storedEvents} local events)`);
  console.log(`Automatic updates: ${updater.state().enabled ? 'enabled' : 'disabled'}`);
  console.log('Automatic diagnostics: enabled');
  console.log(`Initial setup required: ${auth.setupRequired() ? 'yes' : 'no'}`);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.log(`MAVIK fonctionne déjà sur le port ${PORT}. Aucun second serveur ne sera lancé.`);
    process.exit(0);
  }
  diagnostics.recordCrash(error, 'SERVER_LISTEN');
  throw error;
});

let stopping = false;
function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received. Stopping MAVIK GCOS...`);
  server.close(() => process.exit(exitCode));
  setTimeout(() => process.exit(exitCode || 1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('uncaughtException', (error) => { diagnostics.recordCrash(error, 'UNCAUGHT_EXCEPTION'); console.error('[MAVIK CRASH]', error); shutdown('UNCAUGHT_EXCEPTION', 1); });
process.on('unhandledRejection', (error) => { diagnostics.recordCrash(error, 'UNHANDLED_REJECTION'); console.error('[MAVIK REJECTION]', error); shutdown('UNHANDLED_REJECTION', 1); });
