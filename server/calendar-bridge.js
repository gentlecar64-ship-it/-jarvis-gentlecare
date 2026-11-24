'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CONFIG_FILE = path.join(__dirname, 'data', 'calendar-config.json');

function defaultConfig() {
  return { feedToken: crypto.randomBytes(24).toString('hex'), googlePrivateIcalUrl: '', blockWorkshopFromGoogle: false, lastSyncAt: '', lastSyncError: '' };
}
function ensure() {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig(), null, 2), 'utf8');
}
function read() {
  ensure();
  try { return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; }
  catch { const value = defaultConfig(); write(value); return value; }
}
function write(value) {
  ensure();
  const temp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, CONFIG_FILE);
}
function settings(origin = '') {
  const config = read();
  return {
    configured: Boolean(config.googlePrivateIcalUrl),
    googlePrivateIcalUrlMasked: config.googlePrivateIcalUrl ? `${config.googlePrivateIcalUrl.slice(0, 24)}…` : '',
    blockWorkshopFromGoogle: config.blockWorkshopFromGoogle === true,
    lastSyncAt: config.lastSyncAt || '',
    lastSyncError: config.lastSyncError || '',
    feedUrl: `${String(origin || '').replace(/\/$/, '')}/calendar/mavik.ics?token=${encodeURIComponent(config.feedToken)}`,
    automaticGoogleApiConfigured: Boolean(process.env.GCOS_GOOGLE_CALENDAR_ACCESS_TOKEN && process.env.GCOS_GOOGLE_CALENDAR_ID)
  };
}
function configure(input = {}, user = {}) {
  if (!['admin', 'associate'].includes(user.role)) throw Object.assign(new Error('CALENDAR_DIRECTION_REQUIRED'), { status: 403 });
  const current = read();
  const next = {
    ...current,
    googlePrivateIcalUrl: input.googlePrivateIcalUrl === undefined ? current.googlePrivateIcalUrl : String(input.googlePrivateIcalUrl || '').trim(),
    blockWorkshopFromGoogle: input.blockWorkshopFromGoogle === undefined ? current.blockWorkshopFromGoogle : input.blockWorkshopFromGoogle === true,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name || user.id || ''
  };
  if (next.googlePrivateIcalUrl && !/^https:\/\//i.test(next.googlePrivateIcalUrl)) throw Object.assign(new Error('CALENDAR_ICAL_URL_INVALID'), { status: 400 });
  write(next);
  return settings(input.origin || '');
}
function unfold(value) { return String(value || '').replace(/\r?\n[ \t]/g, ''); }
function parseDateValue(raw) {
  const value = String(raw || '').trim();
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}${value.endsWith('Z') ? 'Z' : ''}`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  return '';
}
function parseIcs(content) {
  const text = unfold(content);
  return [...text.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)].map((match) => {
    const lines = match[1].split(/\r?\n/);
    const field = (name) => {
      const line = lines.find((item) => item.startsWith(`${name}:`) || item.startsWith(`${name};`));
      return line ? line.slice(line.indexOf(':') + 1).replace(/\\n/g, ' ').replace(/\\,/g, ',').trim() : '';
    };
    return {
      uid: field('UID') || crypto.randomUUID(),
      title: field('SUMMARY') || 'Événement agenda',
      description: field('DESCRIPTION'),
      location: field('LOCATION'),
      start: parseDateValue(field('DTSTART')),
      end: parseDateValue(field('DTEND')),
      status: field('STATUS') || 'CONFIRMED'
    };
  }).filter((event) => event.start && !/CANCELLED/i.test(event.status));
}
function dateOnly(value) { return String(value || '').slice(0, 10); }
async function sync(store) {
  const config = read();
  if (!config.googlePrivateIcalUrl) throw Object.assign(new Error('CALENDAR_NOT_CONFIGURED'), { status: 409 });
  try {
    const response = await fetch(config.googlePrivateIcalUrl, { headers: { 'User-Agent': 'MAVIK-GCOS-Calendar/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`CALENDAR_FETCH_${response.status}`);
    const events = parseIcs(await response.text());
    const existing = store.list('externalCalendarEvents') || [];
    const received = new Set();
    for (const event of events) {
      received.add(event.uid);
      const current = existing.find((item) => item.uid === event.uid);
      const patch = { ...event, source: 'Google Agenda iCal', startDate: dateOnly(event.start), endDate: dateOnly(event.end || event.start), blocksWorkshop: config.blockWorkshopFromGoogle === true, syncedAt: new Date().toISOString() };
      if (current) store.update('externalCalendarEvents', current.id, patch); else store.create('externalCalendarEvents', patch);
    }
    for (const old of existing) if (!received.has(old.uid)) store.update('externalCalendarEvents', old.id, { status: 'Supprimé de Google Agenda', blocksWorkshop: false, removedAt: new Date().toISOString() });
    write({ ...config, lastSyncAt: new Date().toISOString(), lastSyncError: '' });
    return { imported: events.length, settings: settings() };
  } catch (error) {
    write({ ...config, lastSyncAt: new Date().toISOString(), lastSyncError: String(error.message || error) });
    throw error;
  }
}
function esc(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsDate(value, endOfDay = false) {
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, '');
  const date = new Date(raw || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  if (endOfDay) date.setHours(17, 0, 0, 0);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function collectPlanningEvents(store) {
  const out = [];
  for (const item of store.list('interventions') || []) {
    const start = item.scheduledDate || item.estimatedStartDate;
    if (!start || /annul|archiv/i.test(String(item.status || ''))) continue;
    out.push({ uid: `intervention-${item.id}@mavik`, title: item.service || item.number || 'Intervention GentleCarE', start, end: item.estimatedEndDate || start, description: `${item.number || ''} · ${item.status || ''}` });
  }
  for (const item of store.list('planningBlocks') || []) {
    if (!item.startDate || /annul|inactif/i.test(String(item.status || ''))) continue;
    out.push({ uid: `block-${item.id}@mavik`, title: item.title || item.type || 'Planning GentleCarE', start: item.startDate, end: item.endDate || item.startDate, description: item.notes || '' });
  }
  for (const item of store.list('tasks') || []) {
    if (!item.dueDate || /termin|annul/i.test(String(item.status || ''))) continue;
    out.push({ uid: `task-${item.id}@mavik`, title: `Tâche — ${item.title || ''}`, start: item.dueDate, end: item.dueDate, description: item.assignee || '' });
  }
  return out;
}
function buildIcs(store) {
  const now = icsDate(new Date().toISOString());
  const events = collectPlanningEvents(store).map((event) => `BEGIN:VEVENT\r\nUID:${esc(event.uid)}\r\nDTSTAMP:${now}\r\nDTSTART;VALUE=DATE:${icsDate(event.start)}\r\nDTEND;VALUE=DATE:${icsDate(event.end)}\r\nSUMMARY:${esc(event.title)}\r\nDESCRIPTION:${esc(event.description)}\r\nEND:VEVENT`).join('\r\n');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Avenor//MAVIK GCOS//FR\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:MAVIK GentleCarE\r\n${events}\r\nEND:VCALENDAR\r\n`;
}
function tokenValid(token) {
  if (!token) return false;
  const supplied = Buffer.from(String(token));
  const expected = Buffer.from(String(read().feedToken || ''));
  return supplied.length === expected.length && supplied.length > 0 && crypto.timingSafeEqual(supplied, expected);
}

module.exports = { CONFIG_FILE, settings, configure, sync, buildIcs, tokenValid, parseIcs };
