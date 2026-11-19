'use strict';

// Durable, idempotent intake shared by iPhone and the office.
// Stored separately from legacy GCOS data so older clients cannot erase incoming parts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const FILE = process.env.GCOS_PARTS_DATA_FILE || path.join(__dirname, 'data', 'incoming-parts.json');
const STATUSES = new Set(['À traiter', 'Devis à préparer', 'En devis', 'En atelier', 'Archivée']);
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function read() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) return [];
  let data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { fail('PARTS_STORE_UNREADABLE', 500); }
  if (!Array.isArray(data)) fail('PARTS_STORE_INVALID', 500);
  return data;
}
function write(items) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const name = FILE + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(name, JSON.stringify(items, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(name, FILE);
  } finally { if (fs.existsSync(name)) fs.unlinkSync(name); }
}
function cleanText(input, max = 500) { return String(input ?? '').trim().slice(0, max); }
function cleanPhotos(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 8) fail('PARTS_TOO_MANY_PHOTOS');
  return value.map((photo) => {
    const data = typeof photo === 'string' ? photo : photo?.data;
    if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) fail('PARTS_INVALID_PHOTO');
    if (data.length > 2_500_000) fail('PARTS_PHOTO_TOO_LARGE', 413);
    return { data, name: cleanText(photo?.name || 'Photo', 100) };
  });
}
function list() { return read().map((item) => ({ ...item, photoCount: item.photos.length, photos: item.photos.map(({ name }) => ({ name })) })); }
function one(id) { return read().find((item) => item.id === id) || null; }
function receive(payload = {}, user = {}) {
  const clientId = cleanText(payload.clientRecordId, 140);
  if (!/^[a-zA-Z0-9:_-]{8,140}$/.test(clientId)) fail('PARTS_CLIENT_RECORD_ID_REQUIRED');
  const items = read();
  const existing = items.find((item) => item.clientRecordId === clientId);
  if (existing) return { item: existing, duplicate: true, acknowledged: true };
  const kind = cleanText(payload.kind, 120);
  if (!kind) fail('PARTS_KIND_REQUIRED');
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(), clientRecordId: clientId,
    kind, name: cleanText(payload.name, 160), category: cleanText(payload.category, 60),
    description: cleanText(payload.description, 4000),
    reference: cleanText(payload.reference, 100),
    clientId: cleanText(payload.clientId, 150),
    vehicleId: cleanText(payload.vehicleId, 150),
    photos: cleanPhotos(payload.photos),
    status: 'À traiter', createdAt: now, updatedAt: now,
    capturedAt: cleanText(payload.capturedAt, 60) || now,
    receivedBy: cleanText(user.id, 120), createdByName: cleanText(user.name, 120),
    history: [{ event: 'received', at: now, by: cleanText(user.name, 120) }]
  };
  items.unshift(item);
  write(items);
  return { item, duplicate: false, acknowledged: true };
}
function update(id, payload = {}, user = {}) {
  const items = read();
  const i = items.findIndex((item) => item.id === id);
  if (i < 0) fail('PART_NOT_FOUND', 404);
  const item = items[i];
  const patch = {};
  for (const field of ['name', 'description', 'reference', 'clientId', 'vehicleId', 'category']) {
    if (Object.hasOwn(payload, field)) patch[field] = cleanText(payload[field], field === 'description' ? 4000 : 160);
  }
  if (Object.hasOwn(payload, 'status')) {
    if (!STATUSES.has(payload.status)) fail('PART_STATUS_INVALID');
    patch.status = payload.status;
  }
  const now = new Date().toISOString();
  items[i] = { ...item, ...patch, updatedAt: now,
    history: [...item.history, { event: 'updated', at: now, by: cleanText(user.name, 120), patch }] };
  write(items);
  return items[i];
}
module.exports = { list, one, receive, update, FILE };
