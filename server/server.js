'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { URL } = require('node:url');
const localStore = require('./local-store');

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
const HOST = process.env.GCOS_HOST || '127.0.0.1';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'app6i45G4WG2nmQff';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || '';
const ALLOWED_ORIGIN = process.env.GCOS_ALLOWED_ORIGIN || '*';
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOCAL_COLLECTIONS = new Set(['clients', 'vehicles', 'interventions', 'observations', 'communications']);

function commonHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-GCOS-Client',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer'
  };
}

function json(res, status, body) { res.writeHead(status, commonHeaders('application/json; charset=utf-8')); res.end(JSON.stringify(body)); }
function html(res, status, body) { res.writeHead(status, commonHeaders('text/html; charset=utf-8')); res.end(body); }

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error('GCOS_BODY_TOO_LARGE'), { status: 413 });
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
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `AIRTABLE_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function serveDashboard(res) {
  const filePath = path.join(PUBLIC_DIR, 'alpha.html');
  if (!fs.existsSync(filePath)) return html(res, 404, '<h1>GCOS Alpha introuvable</h1>');
  return html(res, 200, fs.readFileSync(filePath, 'utf8'));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/alpha')) return serveDashboard(res);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { service: 'GCOS Server', version: '0.5.0-alpha', airtableConfigured: Boolean(AIRTABLE_TOKEN), smsProviderConfigured: false, localStore: localStore.DATA_FILE, host: HOST, uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() });
    }
    if (req.method === 'GET' && url.pathname === '/api/local/summary') return json(res, 200, localStore.summary());

    const localRecordMatch = url.pathname.match(/^\/api\/local\/([^/]+)\/([^/]+)$/);
    if (localRecordMatch && req.method === 'PATCH') {
      const collection = decodeURIComponent(localRecordMatch[1]);
      if (!LOCAL_COLLECTIONS.has(collection)) return json(res, 404, { error: 'GCOS_COLLECTION_NOT_FOUND' });
      return json(res, 200, localStore.update(collection, decodeURIComponent(localRecordMatch[2]), await readBody(req)));
    }

    const localCollectionMatch = url.pathname.match(/^\/api\/local\/([^/]+)$/);
    if (localCollectionMatch) {
      const collection = decodeURIComponent(localCollectionMatch[1]);
      if (!LOCAL_COLLECTIONS.has(collection)) return json(res, 404, { error: 'GCOS_COLLECTION_NOT_FOUND' });
      if (req.method === 'GET') return json(res, 200, { records: localStore.list(collection) });
      if (req.method === 'POST') return json(res, 201, localStore.create(collection, await readBody(req)));
    }

    const recordMatch = url.pathname.match(/^\/api\/airtable\/tables\/([^/]+)\/([^/]+)$/);
    if (recordMatch && req.method === 'PATCH') {
      if (!requireAirtable(res)) return;
      const payload = await airtableRequest(decodeURIComponent(recordMatch[1]), { method: 'PATCH', recordId: decodeURIComponent(recordMatch[2]), body: await readBody(req) });
      return json(res, 200, payload);
    }

    const tableMatch = url.pathname.match(/^\/api\/airtable\/tables\/([^/]+)$/);
    if (tableMatch && req.method === 'GET') {
      if (!requireAirtable(res)) return;
      const payload = await airtableRequest(decodeURIComponent(tableMatch[1]), { query: { maxRecords: url.searchParams.get('maxRecords') || 50, view: url.searchParams.get('view') || undefined, filterByFormula: url.searchParams.get('filterByFormula') || undefined } });
      return json(res, 200, payload);
    }
    if (tableMatch && req.method === 'POST') {
      if (!requireAirtable(res)) return;
      return json(res, 201, await airtableRequest(decodeURIComponent(tableMatch[1]), { method: 'POST', body: await readBody(req) }));
    }

    return json(res, 404, { error: 'GCOS_ROUTE_NOT_FOUND' });
  } catch (error) {
    console.error('[GCOS]', error);
    return json(res, error.status || 500, { error: error.message || 'GCOS_INTERNAL_ERROR' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`GCOS Server started on http://${HOST}:${PORT}`);
  console.log(`Alpha dashboard: http://${HOST}:${PORT}/alpha`);
  console.log(`Airtable: ${AIRTABLE_TOKEN ? 'configured' : 'not configured'}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received. Stopping GCOS Server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));