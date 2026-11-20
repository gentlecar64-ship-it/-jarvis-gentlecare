'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'mavik-insights.ndjson');
const MAX_BATCH = 500;
const MAX_EVENT_BYTES = 32_000;

const BLOCKED_KEYS = [
  /password/i, /secret/i, /token/i, /authorization/i,
  /payment/i, /card/i, /cvv/i, /iban/i, /bic/i,
  /email/i, /phone/i, /address/i, /adresse/i,
  /first.?name/i, /last.?name/i, /^name$/i
];

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sanitize(value, depth = 0) {
  if (depth > 5) return '[limite]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, 250);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (BLOCKED_KEYS.some((pattern) => pattern.test(key))) continue;
      output[key] = sanitize(item, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, 250);
}

function normalizeEvent(input, user) {
  const event = sanitize(input || {});
  const normalized = {
    id: typeof event.id === 'string' ? event.id.slice(0, 80) : crypto.randomUUID(),
    schemaVersion: Number(event.schemaVersion) || 1,
    eventName: String(event.eventName || '').trim().slice(0, 100),
    level: ['essential', 'productImprovement', 'sectorIntelligence'].includes(event.level) ? event.level : 'productImprovement',
    occurredAt: Number.isNaN(Date.parse(event.occurredAt)) ? new Date().toISOString() : new Date(event.occurredAt).toISOString(),
    receivedAt: new Date().toISOString(),
    installationId: String(event.installationId || '').slice(0, 80),
    application: String(event.application || 'GCOS').slice(0, 40),
    properties: sanitize(event.properties || {}),
    actorRole: String(user?.role || 'unknown').slice(0, 40)
  };
  if (!normalized.eventName) throw Object.assign(new Error('INSIGHTS_EVENT_NAME_REQUIRED'), { status: 400 });
  if (!normalized.installationId) throw Object.assign(new Error('INSIGHTS_INSTALLATION_REQUIRED'), { status: 400 });
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_EVENT_BYTES) throw Object.assign(new Error('INSIGHTS_EVENT_TOO_LARGE'), { status: 413 });
  return normalized;
}

function appendBatch(events, user) {
  if (!Array.isArray(events)) throw Object.assign(new Error('INSIGHTS_EVENTS_REQUIRED'), { status: 400 });
  if (!events.length) return { accepted: [], rejected: [] };
  if (events.length > MAX_BATCH) throw Object.assign(new Error('INSIGHTS_BATCH_TOO_LARGE'), { status: 413 });
  ensureDataDir();
  const accepted = [];
  const rejected = [];
  const lines = [];
  for (const input of events) {
    try {
      const event = normalizeEvent(input, user);
      lines.push(JSON.stringify(event));
      accepted.push(event.id);
    } catch (error) {
      rejected.push({ id: input?.id || null, error: error.message });
    }
  }
  if (lines.length) fs.appendFileSync(EVENTS_FILE, `${lines.join('\n')}\n`, 'utf8');
  return { accepted, rejected };
}

function status() {
  ensureDataDir();
  if (!fs.existsSync(EVENTS_FILE)) return { enabled: true, storedEvents: 0, bytes: 0 };
  const stat = fs.statSync(EVENTS_FILE);
  const content = fs.readFileSync(EVENTS_FILE, 'utf8');
  const storedEvents = content ? content.trim().split(/\r?\n/).filter(Boolean).length : 0;
  return { enabled: true, storedEvents, bytes: stat.size, file: path.basename(EVENTS_FILE) };
}

module.exports = { appendBatch, status, sanitize };
