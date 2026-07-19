'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { knowledge } = require('./jarvis-knowledge');

const PUBLIC_DIR = path.join(__dirname, 'public');
const QUOTE_DIR = path.join(PUBLIC_DIR, 'generated', 'quotes');
const PHOTO_DIR = path.join(PUBLIC_DIR, 'generated', 'photos');
const LOGO_DIR = path.join(__dirname, 'assets', 'logo');
const DEPOSIT_RATE = 50;
const VAT_RATE = 20;
const COMPANY = Object.freeze({
  name: 'GentleCarE',
  address: 'ZA Lantegia, 64990 Villefranque',
  phone: '07 67 75 72 07',
  emails: 'david@gentlecare.fr · benedicte@gentlecare.fr',
  siret: '950 325 466 00012',
  capital: '10 000 €'
});

const DOSSIER_STATES = Object.freeze([
  'Demande reçue',
  'Devis provisoire',
  'Devis à finaliser',
  'Devis à valider',
  'Devis envoyé',
  'Devis accepté',
  'Acompte 50 % en attente',
  'Acompte reçu',
  'Intervention planifiée',
  'Véhicule en cours',
  'Délai ajusté',
  'Intervention terminée',
  'Rapport et facture à valider',
  'Solde en attente',
  'Règlement reçu',
  'À transférer au showroom',
  'Préparation showroom',
  'En attente client',
  'Dossier clôturé',
  'Archivé'
]);

function ensureDirs() {
  fs.mkdirSync(QUOTE_DIR, { recursive: true });
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
}

function safeList(store, collection) {
  try { return store.list(collection) || []; }
  catch { return []; }
}

function normalize(value) { return String(value || '').trim(); }
function lower(value) { return normalize(value).toLowerCase(); }
function isoDate(date) { return new Date(date).toISOString().slice(0, 10); }
function money(value) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0)); }
function escapeXml(value) { return String(value ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])); }
function slug(value, fallback = 'A-COMPLETER') {
  const clean = normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return clean || fallback;
}
function addDays(date, days) { const out = new Date(date); out.setDate(out.getDate() + days); return out; }
function isWorkday(date) { const day = date.getDay(); return day !== 0 && day !== 6; }
function nextWorkday(date) { let out = new Date(date); do { out = addDays(out, 1); } while (!isWorkday(out)); return out; }
function addWorkdays(date, count) { let out = new Date(date); let remaining = Math.max(0, Number(count || 0)); while (remaining > 0) { out = addDays(out, 1); if (isWorkday(out)) remaining -= 1; } return out; }
function formatFrenchDate(date, time = '') {
  const value = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(date));
  return time ? `${value} à ${time}` : value;
}
function quoteIdFromText(text) {
  const match = String(text || '').match(/(?:DEV|DV)-\d{4}-\d{4}/i);
  return match ? match[0].toUpperCase().replace(/^DV-/, 'DEV-') : '';
}

function officialLogoBase64() {
  try {
    return fs.readdirSync(LOGO_DIR).filter((name) => /^\d+\.txt$/.test(name)).sort().map((name) => fs.readFileSync(path.join(LOGO_DIR, name), 'utf8').trim()).join('');
  } catch { return ''; }
}

function extractEmail(text) {
  return (String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0].toLowerCase();
}
function extractPhone(text) {
  const match = String(text || '').match(/(?:(?:\+33|0033)[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/);
  return match ? match[0].replace(/\D/g, '').replace(/^0033/, '0').replace(/^33/, '0') : '';
}
function extractRegistration(text) {
  const value = String(text || '').toUpperCase();
  const modern = value.match(/\b[A-Z]{2}[ -]?\d{3}[ -]?[A-Z]{2}\b/);
  if (modern) return modern[0].replace(/\s/g, '-');
  const old = value.match(/\b\d{1,4}[ -]?[A-Z]{1,3}[ -]?\d{2,3}\b/);
  return old ? old[0].replace(/\s/g, '-') : '';
}
function extractClientName(text) {
  const patterns = [
    /(?:au nom de|client(?:e)?|pour monsieur|pour madame|pour)\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,70}?)(?=\s+(?:mail|email|e-mail|t[ée]l|téléphone|portable|pour une|pour un|avec une|avec un|véhicule|voiture|immatricul|plaque)\b|[,.;]|$)/i,
    /(?:monsieur|madame)\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,70}?)(?=\s+(?:mail|email|t[ée]l|portable|avec|pour)\b|[,.;]|$)/i
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

const BRANDS = ['Abarth','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Cadillac','Chevrolet','Chrysler','Citroën','Cupra','Dacia','Dodge','DS','Ferrari','Fiat','Ford','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia','Lamborghini','Land Rover','Lexus','Maserati','Mazda','McLaren','Mercedes','Mini','Mitsubishi','Nissan','Opel','Peugeot','Porsche','Renault','Rolls Royce','Seat','Skoda','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo'];
function extractVehicle(text) {
  const original = String(text || '');
  const normalized = lower(original);
  let brand = '';
  for (const candidate of BRANDS) {
    if (normalized.includes(candidate.toLowerCase())) { brand = candidate; break; }
  }
  let model = '';
  if (brand) {
    const index = normalized.indexOf(brand.toLowerCase());
    const tail = original.slice(index + brand.length).trim();
    model = tail.split(/[,.;]|\b(?:de|du|avec|immatricul|plaque|couleur|année|annee|kilom|pour|mail|email|t[ée]l|portable|devis|cryo|dinitrol|pack)\b/i)[0].trim().split(/\s+/).slice(0, 4).join(' ');
  }
  const colors = ['blanche','blanc','noire','noir','bleue','bleu','rouge','grise','gris','verte','vert','jaune','orange','beige','marron','argent','violette','violet'];
  const color = colors.find((item) => normalized.includes(item)) || '';
  const year = (original.match(/\b(?:19|20)\d{2}\b/) || [''])[0];
  const mileageMatch = original.match(/\b(\d{1,3}(?:[ .]\d{3})+)\s*(?:km|kilomètres?|kilometres?)\b/i);
  return {
    brand,
    model,
    registration: extractRegistration(original),
    color: color ? color.charAt(0).toUpperCase() + color.slice(1) : '',
    year,
    mileage: mileageMatch ? Number(mileageMatch[1].replace(/\D/g, '')) : 0
  };
}

function inferService(text) {
  const value = lower(text);
  const pricing = knowledge.pricing;
  if (/pass fondateur|fondateur/.test(value)) return { label: 'Pack Intégral Cryo + Dinitrol — Pass Fondateur', totalTtc: pricing.integralFounderTtc, durationDays: 2, tariffSource: 'Pass Fondateur -30 %' };
  if (/tarif club|membre du club|club/.test(value) && /(intégral|integral|cryo|dinitrol)/.test(value)) return { label: 'Pack Intégral Cryo + Dinitrol — Tarif Club', totalTtc: pricing.integralClubTtc, durationDays: 2, tariffSource: 'Tarif Club' };
  if (/pack intégral|pack integral|cryo.*dinitrol|dinitrol.*cryo/.test(value)) return { label: 'Pack Intégral Cryo + Dinitrol', totalTtc: pricing.integralPublicTtc, durationDays: 2, tariffSource: 'Tarif public' };
  if (/dinitrol|anticorrosion|anti-corrosion/.test(value)) return { label: 'Protection anticorrosion Dinitrol', totalTtc: 0, durationDays: 2, tariffSource: 'Tarif à valider après inspection' };
  if (/cryo|cryonettoyage|nettoyage cryogénique|nettoyage cryogenique/.test(value)) return { label: 'Cryonettoyage automobile', totalTtc: 0, durationDays: 2, tariffSource: 'Tarif à valider après inspection' };
  return { label: '', totalTtc: 0, durationDays: knowledge.operations.standardVehicleDurationDays || 2, tariffSource: 'Prestation à préciser' };
}

function inspectionProposal(store) {
  const quotes = safeList(store, 'quotes');
  let cursor = nextWorkday(new Date());
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const key = isoDate(cursor);
    const used = quotes.filter((item) => item.inspectionDate === key).map((item) => item.inspectionTime);
    for (const time of ['10:00', '15:00']) if (!used.includes(time)) return { date: key, time, label: formatFrenchDate(cursor, time), durationMinutes: 60, status: 'À valider en interne' };
    cursor = nextWorkday(cursor);
  }
  return { date: '', time: '', label: 'Créneau à déterminer', durationMinutes: 60, status: 'À valider en interne' };
}

function occupiedDates(store) {
  const occupied = new Set();
  for (const intervention of safeList(store, 'interventions')) {
    if (['Annulée', 'Archivée'].includes(intervention.status)) continue;
    const start = intervention.scheduledDate || intervention.estimatedStartDate;
    const end = intervention.estimatedEndDate || start;
    if (!start) continue;
    let cursor = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (cursor <= last) { if (isWorkday(cursor)) occupied.add(isoDate(cursor)); cursor = addDays(cursor, 1); }
  }
  return occupied;
}

function workshopProposal(store, inspection, durationDays) {
  const occupied = occupiedDates(store);
  let start = nextWorkday(new Date(`${inspection.date || isoDate(new Date())}T12:00:00`));
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (!isWorkday(start)) { start = nextWorkday(start); continue; }
    const dates = [];
    let cursor = new Date(start);
    while (dates.length < durationDays) { if (isWorkday(cursor)) dates.push(isoDate(cursor)); cursor = addDays(cursor, 1); }
    if (dates.every((date) => !occupied.has(date))) {
      const end = new Date(`${dates[dates.length - 1]}T12:00:00`);
      const delivery = nextWorkday(end);
      return {
        depositDate: isoDate(addDays(start, -1)), depositTime: '16:00',
        startDate: dates[0], startTime: '08:30',
        endDate: dates[dates.length - 1],
        deliveryDate: isoDate(delivery), deliveryTime: '16:30',
        durationDays, status: 'Indicatif — confirmé après devis accepté et acompte reçu'
      };
    }
    start = nextWorkday(start);
  }
  return { depositDate: '', depositTime: '', startDate: '', startTime: '', endDate: '', deliveryDate: '', deliveryTime: '', durationDays, status: 'Planning à valider' };
}

function savePhoto(dataUrl, filename = 'vehicule.jpg') {
  if (!dataUrl) return '';
  const match = String(dataUrl).match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw Object.assign(new Error('PHOTO_FORMAT_INVALID'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 7_000_000) throw Object.assign(new Error('PHOTO_TOO_LARGE'), { status: 413 });
  ensureDirs();
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const base = slug(path.parse(filename).name, 'VEHICULE').toLowerCase();
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}.${ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, name), buffer);
  return `/generated/photos/${name}`;
}

function findClient(store, parsed) {
  const clients = safeList(store, 'clients');
  if (parsed.email) { const item = clients.find((client) => lower(client.email) === parsed.email); if (item) return item; }
  if (parsed.mobile) { const digits = parsed.mobile.replace(/\D/g, ''); const item = clients.find((client) => String(client.mobile || client.phone || '').replace(/\D/g, '') === digits); if (item) return item; }
  if (parsed.name) { const item = clients.find((client) => lower(client.name) === lower(parsed.name)); if (item) return item; }
  return null;
}

function findVehicle(store, clientId, parsed) {
  const vehicles = safeList(store, 'vehicles').filter((item) => item.clientId === clientId);
  if (parsed.registration) { const item = vehicles.find((vehicle) => normalize(vehicle.registration).toUpperCase() === parsed.registration); if (item) return item; }
  return vehicles.find((vehicle) => lower(vehicle.brand) === lower(parsed.brand) && lower(vehicle.model) === lower(parsed.model)) || null;
}

function quoteMissingFields(client, vehicle, service, photoUrl) {
  const missing = [];
  if (!client.name || /à compléter/i.test(client.name)) missing.push('nom du client');
  if (!client.email && !client.mobile && !client.phone) missing.push('e-mail ou portable');
  if (!vehicle.brand) missing.push('marque du véhicule');
  if (!vehicle.model) missing.push('modèle du véhicule');
  if (!service.label) missing.push('prestation souhaitée');
  if (!photoUrl) missing.push('photo extérieure nette du véhicule');
  if (!service.totalTtc) missing.push('tarif à valider après inspection');
  return missing;
}

function statusToken(status) {
  if (/archiv/i.test(status)) return 'ARCHIVE';
  if (/accept/i.test(status)) return 'ACCEPTE';
  if (/envoy/i.test(status)) return 'ENVOYE';
  if (/validé|valide$/i.test(status)) return 'VALIDE';
  return 'ATTENTE-VALIDATION';
}

function quoteFileName(quote, client, vehicle) {
  const now = new Date();
  const date = isoDate(now);
  const time = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
  const number = String(quote.number || 'DEV-0000-0000').replace(/^DEV-/, 'DV-');
  return `${date}_${time}_${number}_${slug(client.name)}_${slug(`${vehicle.brand}-${vehicle.model}`)}_${slug(vehicle.registration)}_${statusToken(quote.status)}_${quote.provisional ? 'v0.1' : 'v1.0'}.svg`;
}

function svgTextLines(text, max = 48) {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function generateVisual(store, quote) {
  ensureDirs();
  const client = safeList(store, 'clients').find((item) => item.id === quote.clientId) || {};
  const vehicle = safeList(store, 'vehicles').find((item) => item.id === quote.vehicleId) || {};
  const logo = officialLogoBase64();
  const fileName = quoteFileName(quote, client, vehicle);
  const total = Number(quote.totalTtc || 0);
  const deposit = Number(quote.depositTtc || total * DEPOSIT_RATE / 100);
  const missing = Array.isArray(quote.missingFields) ? quote.missingFields : [];
  const photo = quote.vehiclePhotoUrl || vehicle.photoUrl || '';
  const serviceLines = svgTextLines(quote.service || 'Prestation à définir', 44);
  const missingLines = svgTextLines(missing.length ? `Informations manquantes : ${missing.join(', ')}.` : 'Dossier suffisamment renseigné. Validation David ou Bénédicte obligatoire avant envoi.', 66);
  const serviceSvg = serviceLines.map((line, index) => `<text x="94" y="${930 + index * 44}" font-size="31" fill="#edf7fb" font-weight="700">${escapeXml(line)}</text>`).join('');
  const missingSvg = missingLines.map((line, index) => `<text x="94" y="${1532 + index * 30}" font-size="20" fill="#c6d7de">${escapeXml(line)}</text>`).join('');
  const photoSvg = photo
    ? `<defs><clipPath id="vehicleClip"><rect x="66" y="332" width="1268" height="430" rx="30"/></clipPath></defs><image href="${escapeXml(photo)}" x="66" y="332" width="1268" height="430" preserveAspectRatio="xMidYMid slice" clip-path="url(#vehicleClip)"/><rect x="66" y="332" width="1268" height="430" rx="30" fill="none" stroke="#9bd9ef" stroke-opacity=".35" stroke-width="2"/>`
    : `<rect x="66" y="332" width="1268" height="430" rx="30" fill="#102732" stroke="#9bd9ef" stroke-opacity=".32" stroke-width="2"/><text x="700" y="535" text-anchor="middle" font-size="34" fill="#91aab5">PHOTO DU VÉHICULE À AJOUTER</text><text x="700" y="580" text-anchor="middle" font-size="20" fill="#78909a">Le devis définitif utilisera la photo réelle issue de l’inspection.</text>`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1980" viewBox="0 0 1400 1980">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07141c"/><stop offset=".55" stop-color="#132e39"/><stop offset="1" stop-color="#102019"/></linearGradient><linearGradient id="price" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5a8e3d"/><stop offset="1" stop-color="#88b75e"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity=".42"/></filter></defs>
<rect width="1400" height="1980" fill="url(#bg)"/>
<circle cx="1240" cy="100" r="260" fill="#d7f3ff" opacity=".07"/><circle cx="120" cy="1850" r="350" fill="#9fd171" opacity=".05"/>
<rect x="46" y="42" width="1308" height="1896" rx="42" fill="#07171f" fill-opacity=".72" stroke="#dff4fb" stroke-opacity=".14" filter="url(#shadow)"/>
${logo ? `<image href="data:image/png;base64,${logo}" x="72" y="64" width="430" height="210" preserveAspectRatio="xMidYMid meet"/>` : ''}
<text x="1320" y="102" text-anchor="end" font-size="23" fill="#9db2bb">DEVIS VISUEL PERSONNALISÉ</text>
<text x="1320" y="144" text-anchor="end" font-size="34" font-weight="800" fill="#ffffff">${escapeXml(quote.number)}</text>
<rect x="1015" y="174" width="305" height="54" rx="27" fill="${quote.provisional ? '#8b632d' : '#486f31'}"/><text x="1167" y="209" text-anchor="middle" font-size="19" font-weight="800" fill="#fff">${escapeXml(quote.status)}</text>
<text x="72" y="296" font-size="19" fill="#abc0c9">${escapeXml(COMPANY.name)} · ${escapeXml(COMPANY.address)} · ${escapeXml(COMPANY.phone)}</text>
${photoSvg}
<rect x="66" y="790" width="615" height="190" rx="25" fill="#10252e" stroke="#dff4fb" stroke-opacity=".12"/><text x="94" y="838" font-size="18" fill="#9bd9ef" font-weight="700">CLIENT</text><text x="94" y="884" font-size="31" fill="#fff" font-weight="800">${escapeXml(client.name || 'À compléter')}</text><text x="94" y="926" font-size="21" fill="#b7cad2">${escapeXml(client.email || client.mobile || client.phone || 'Coordonnées à compléter')}</text>
<rect x="707" y="790" width="627" height="190" rx="25" fill="#10252e" stroke="#dff4fb" stroke-opacity=".12"/><text x="735" y="838" font-size="18" fill="#a9d47b" font-weight="700">VÉHICULE</text><text x="735" y="884" font-size="31" fill="#fff" font-weight="800">${escapeXml([vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'À compléter')}</text><text x="735" y="926" font-size="21" fill="#b7cad2">${escapeXml([vehicle.year, vehicle.color, vehicle.registration].filter(Boolean).join(' · ') || 'Identification à compléter')}</text>
<rect x="66" y="1008" width="1268" height="260" rx="28" fill="#0d2029" stroke="#dff4fb" stroke-opacity=".12"/><text x="94" y="1060" font-size="18" fill="#9bd9ef" font-weight="700">PRESTATION PROPOSÉE</text>${serviceSvg}<text x="94" y="1185" font-size="20" fill="#9fb5be">Tarification : ${escapeXml(quote.tariffSource || 'à valider')}</text><text x="94" y="1225" font-size="19" fill="#9fb5be">Estimation indicative : ${escapeXml(String(quote.estimatedDurationDays || 2))} jour(s) ouvré(s) · validation humaine obligatoire</text>
<rect x="66" y="1296" width="795" height="190" rx="28" fill="#10252e" stroke="#dff4fb" stroke-opacity=".12"/><text x="94" y="1344" font-size="18" fill="#9bd9ef" font-weight="700">PLANNING PROPOSÉ</text><text x="94" y="1390" font-size="22" fill="#fff">Inspection gratuite : ${escapeXml(quote.inspectionLabel || 'à programmer')}</text><text x="94" y="1432" font-size="22" fill="#fff">Intervention : ${escapeXml(quote.estimatedStartDate || 'à confirmer')} → ${escapeXml(quote.estimatedEndDate || 'à confirmer')}</text><text x="94" y="1472" font-size="19" fill="#a8bbc3">Créneau confirmé après devis accepté et acompte encaissé.</text>
<rect x="887" y="1296" width="447" height="190" rx="28" fill="url(#price)"/><text x="1110" y="1350" text-anchor="middle" font-size="18" fill="#eef8e8" font-weight="700">TOTAL TTC</text><text x="1110" y="1413" text-anchor="middle" font-size="48" fill="#fff" font-weight="900">${total ? escapeXml(money(total)) : 'À VALIDER'}</text><text x="1110" y="1460" text-anchor="middle" font-size="20" fill="#eef8e8">Acompte 50 % : ${total ? escapeXml(money(deposit)) : 'à calculer'}</text>
<rect x="66" y="1510" width="1268" height="145" rx="25" fill="${quote.provisional ? '#412f1f' : '#132c22'}" stroke="${quote.provisional ? '#ffcf72' : '#91bc5b'}" stroke-opacity=".36"/>${missingSvg}
<text x="72" y="1720" font-size="18" fill="#9bd9ef" font-weight="700">PROCESSUS GENTLECARE</text><text x="72" y="1760" font-size="20" fill="#d9e8ed">1. Contrôle gratuit  ·  2. Devis définitif  ·  3. Validation  ·  4. Acompte 50 %  ·  5. Intervention  ·  6. Rapport et restitution</text>
<line x1="72" y1="1810" x2="1328" y2="1810" stroke="#dff4fb" stroke-opacity=".14"/>
<text x="72" y="1850" font-size="17" fill="#91a7b0">SIRET ${escapeXml(COMPANY.siret)} · Capital social ${escapeXml(COMPANY.capital)} · ${escapeXml(COMPANY.emails)}</text>
<text x="72" y="1890" font-size="16" fill="#78909a">Document préparé automatiquement par Jarvis GentleCarE. Aucun envoi externe sans validation de David ou Bénédicte.</text>
</svg>`;
  fs.writeFileSync(path.join(QUOTE_DIR, fileName), svg, 'utf8');
  return { fileName, visualUrl: `/generated/quotes/${encodeURIComponent(fileName)}`, svg };
}

function parseIntake(input = {}) {
  const text = normalize(input.text || input.command || '');
  const vehicle = extractVehicle(text);
  return {
    text,
    name: normalize(input.clientName || extractClientName(text)),
    email: normalize(input.email || extractEmail(text)).toLowerCase(),
    mobile: normalize(input.mobile || input.phone || extractPhone(text)),
    address: normalize(input.address),
    preferredChannel: normalize(input.preferredChannel) || (extractPhone(text) ? 'SMS' : 'E-mail'),
    ...vehicle,
    brand: normalize(input.brand || vehicle.brand),
    model: normalize(input.model || vehicle.model),
    registration: normalize(input.registration || vehicle.registration).toUpperCase(),
    color: normalize(input.color || vehicle.color),
    year: normalize(input.year || vehicle.year),
    mileage: Number(input.mileage || vehicle.mileage || 0),
    photoUrl: normalize(input.photoUrl),
    photoDataUrl: input.photoDataUrl || '',
    photoName: normalize(input.photoName || 'vehicule.jpg'),
    notes: normalize(input.notes || text)
  };
}

function startIntake(store, input = {}) {
  const user = input.user || {};
  const parsed = parseIntake(input);
  if (!parsed.name && !parsed.email && !parsed.mobile) {
    return { type: 'quote-intake-missing-contact', answer: 'Pour ouvrir le dossier, donnez-moi au minimum le nom du client, son e-mail ou son portable.', data: { missingFields: ['identité ou coordonnées du client'] } };
  }

  let photoUrl = parsed.photoUrl;
  if (parsed.photoDataUrl) photoUrl = savePhoto(parsed.photoDataUrl, parsed.photoName);

  let client = findClient(store, parsed);
  if (client) {
    const patch = {};
    if (parsed.name && (!client.name || /à compléter/i.test(client.name))) patch.name = parsed.name;
    if (parsed.email && !client.email) patch.email = parsed.email;
    if (parsed.mobile && !(client.mobile || client.phone)) patch.mobile = parsed.mobile;
    if (Object.keys(patch).length) client = store.update('clients', client.id, patch);
  } else {
    client = store.create('clients', {
      name: parsed.name || `Client à compléter — ${parsed.email || parsed.mobile}`,
      email: parsed.email,
      mobile: parsed.mobile,
      address: parsed.address,
      preferredChannel: parsed.preferredChannel,
      smsAllowed: Boolean(parsed.mobile),
      emailAllowed: Boolean(parsed.email),
      status: 'Prospect',
      source: 'Devis vocal Jarvis',
      createdBy: user.id || '', createdByName: user.name || ''
    });
  }

  let vehicle = findVehicle(store, client.id, parsed);
  const vehicleLabel = [parsed.brand, parsed.model].filter(Boolean).join(' ') || 'Véhicule à compléter';
  if (vehicle) {
    vehicle = store.update('vehicles', vehicle.id, {
      brand: parsed.brand || vehicle.brand,
      model: parsed.model || vehicle.model,
      label: vehicleLabel,
      registration: parsed.registration || vehicle.registration,
      color: parsed.color || vehicle.color,
      year: parsed.year || vehicle.year,
      mileage: parsed.mileage || vehicle.mileage,
      photoUrl: photoUrl || vehicle.photoUrl,
      notes: parsed.notes || vehicle.notes
    });
  } else {
    vehicle = store.create('vehicles', {
      clientId: client.id,
      brand: parsed.brand,
      model: parsed.model,
      label: vehicleLabel,
      registration: parsed.registration,
      color: parsed.color,
      year: parsed.year,
      mileage: parsed.mileage,
      photoUrl,
      notes: parsed.notes,
      status: 'À inspecter',
      createdBy: user.id || '', createdByName: user.name || ''
    });
  }

  const service = inferService(parsed.text);
  const inspection = inspectionProposal(store);
  const workshop = workshopProposal(store, inspection, service.durationDays);
  const missingFields = quoteMissingFields(client, vehicle, service, photoUrl || vehicle.photoUrl);
  const provisional = missingFields.length > 0;
  const totalTtc = Number(service.totalTtc || 0);
  let quote = store.create('quotes', {
    clientId: client.id,
    vehicleId: vehicle.id,
    status: provisional ? 'À finaliser – informations manquantes' : 'À valider',
    workflowStatus: provisional ? 'Devis à finaliser' : 'Devis à valider',
    provisional,
    version: provisional ? '0.1' : '1.0',
    quoteDate: isoDate(new Date()),
    validUntil: isoDate(addDays(new Date(), 30)),
    service: service.label || 'Prestation à préciser',
    lines: [{ label: service.label || 'Prestation à préciser', quantity: 1, totalTtc }],
    tariffSource: service.tariffSource,
    totalTtc,
    depositRate: DEPOSIT_RATE,
    depositTtc: Math.round(totalTtc * DEPOSIT_RATE) / 100,
    balanceTtc: Math.round(totalTtc * (100 - DEPOSIT_RATE)) / 100,
    vatRate: VAT_RATE,
    missingFields,
    vehiclePhotoUrl: photoUrl || vehicle.photoUrl || '',
    inspectionDate: inspection.date,
    inspectionTime: inspection.time,
    inspectionLabel: inspection.label,
    inspectionStatus: inspection.status,
    proposedDropoffDate: workshop.depositDate,
    proposedDropoffTime: workshop.depositTime,
    estimatedStartDate: workshop.startDate,
    estimatedEndDate: workshop.endDate,
    estimatedDeliveryDate: workshop.deliveryDate,
    estimatedDeliveryTime: workshop.deliveryTime,
    estimatedDurationDays: workshop.durationDays,
    planningStatus: workshop.status,
    validationRequired: true,
    externalSendAllowed: false,
    source: 'Commande vocale Jarvis',
    intakeText: parsed.text,
    createdBy: user.id || '', createdByName: user.name || ''
  });

  const visual = generateVisual(store, quote);
  quote = store.update('quotes', quote.id, { visualFileName: visual.fileName, visualUrl: visual.visualUrl });

  store.create('documents', {
    title: `Devis visuel ${quote.number}`,
    url: visual.visualUrl,
    category: 'Devis visuel',
    clientId: client.id,
    vehicleId: vehicle.id,
    quoteId: quote.id,
    status: 'À valider',
    version: quote.version,
    createdBy: user.id || '', createdByName: user.name || ''
  });

  store.create('tasks', {
    title: `${provisional ? 'Compléter et valider' : 'Valider'} le devis ${quote.number}`,
    status: 'À faire',
    priority: provisional ? 'Haute' : 'Normale',
    dueDate: inspection.date || isoDate(nextWorkday(new Date())),
    assignee: 'David / Bénédicte',
    quoteId: quote.id,
    clientId: client.id,
    vehicleId: vehicle.id,
    instructions: provisional ? `Informations manquantes : ${missingFields.join(', ')}.` : 'Vérifier tarif, dates, photo et prestations avant envoi.',
    createdBy: user.id || '', createdByName: user.name || ''
  });

  if (client.email || client.mobile) {
    store.create('communications', {
      clientId: client.id,
      vehicleId: vehicle.id,
      quoteId: quote.id,
      channel: client.preferredChannel || (client.mobile ? 'SMS' : 'E-mail'),
      status: 'Brouillon – validation requise',
      subject: `Proposition de contrôle gratuit – ${vehicleLabel}`,
      message: `Bonjour ${client.name || ''},\n\nNous avons préparé votre dossier pour votre ${vehicleLabel}. Nous vous proposons un contrôle gratuit le ${inspection.label}. Ce rendez-vous permettra de confirmer précisément les zones à traiter, le délai et le devis définitif.\n\nLe créneau d’intervention actuellement envisagé débute le ${workshop.startDate || 'à confirmer'}, sous réserve de validation du devis et de réception de l’acompte de 50 %.\n\nBien cordialement,\nGentleCarE`,
      attachmentUrl: visual.visualUrl,
      createdBy: user.id || '', createdByName: user.name || ''
    });
  }

  const answer = provisional
    ? `Le dossier ${quote.number} est créé en devis provisoire « à finaliser ». Le visuel est prêt : ${visual.visualUrl}\nInspection gratuite proposée : ${inspection.label}.\nCréneau d’intervention indicatif : du ${workshop.startDate || 'à confirmer'} au ${workshop.endDate || 'à confirmer'}, livraison estimée le ${workshop.deliveryDate || 'à confirmer'}.\nIl manque : ${missingFields.join(', ')}. Aucun envoi ne partira sans validation.`
    : `Le devis visuel ${quote.number} est prêt à être validé : ${visual.visualUrl}\nInspection gratuite proposée : ${inspection.label}.\nIntervention indicative : du ${workshop.startDate} au ${workshop.endDate}, livraison estimée le ${workshop.deliveryDate}.\nAcompte à l’acceptation : ${money(quote.depositTtc)}. Le brouillon client est préparé, mais rien n’est envoyé sans validation.`;

  return {
    type: 'quote-workflow-created',
    answer,
    data: { client, vehicle, quote, visualUrl: visual.visualUrl, missingFields, inspection, workshop, depositRate: DEPOSIT_RATE },
    links: [{ label: `Ouvrir le devis ${quote.number}`, url: visual.visualUrl }]
  };
}

function resolveQuote(store, reference = '') {
  const quotes = safeList(store, 'quotes');
  const number = quoteIdFromText(reference);
  if (number) return quotes.find((item) => item.number === number) || null;
  return quotes[0] || null;
}

function communicationDraft(store, quote, message, subject, user, channel) {
  const client = safeList(store, 'clients').find((item) => item.id === quote.clientId) || {};
  return store.create('communications', {
    clientId: quote.clientId,
    vehicleId: quote.vehicleId,
    quoteId: quote.id,
    interventionId: quote.interventionId || '',
    channel: channel || client.preferredChannel || (client.mobile ? 'SMS' : 'E-mail'),
    status: 'Brouillon – validation requise',
    subject,
    message,
    createdBy: user.id || '', createdByName: user.name || ''
  });
}

function transition(store, quoteReference, action, payload = {}, user = {}) {
  let quote = resolveQuote(store, quoteReference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const client = safeList(store, 'clients').find((item) => item.id === quote.clientId) || {};
  const vehicle = safeList(store, 'vehicles').find((item) => item.id === quote.vehicleId) || {};
  const vehicleLabel = vehicle.label || [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'votre véhicule';
  const now = new Date().toISOString();
  let intervention = quote.interventionId ? safeList(store, 'interventions').find((item) => item.id === quote.interventionId) : null;
  let answer = '';

  switch (action) {
    case 'accept': {
      quote = store.update('quotes', quote.id, { status: 'Accepté', workflowStatus: 'Acompte 50 % en attente', acceptedAt: now, paymentStatus: 'Acompte en attente' });
      store.create('tasks', { title: `Suivre l’acompte de 50 % — ${quote.number}`, status: 'À faire', priority: 'Haute', dueDate: isoDate(addDays(new Date(), 3)), assignee: 'Direction', quoteId: quote.id, clientId: quote.clientId, vehicleId: quote.vehicleId });
      communicationDraft(store, quote, `Bonjour ${client.name || ''},\n\nNous vous remercions pour votre accord concernant le devis ${quote.number}. La réservation définitive du créneau sera confirmée dès réception de l’acompte de 50 %, soit ${money(quote.depositTtc)}.\n\nBien cordialement,\nGentleCarE`, `Acceptation du devis ${quote.number}`, user);
      answer = `Le devis ${quote.number} est marqué accepté. L’acompte de 50 %, soit ${money(quote.depositTtc)}, est maintenant en attente.`;
      break;
    }
    case 'deposit-received': {
      quote = store.update('quotes', quote.id, { workflowStatus: 'Acompte reçu', paymentStatus: 'Acompte reçu', depositReceivedAt: now });
      if (!intervention) {
        intervention = store.create('interventions', {
          vehicleId: quote.vehicleId,
          clientId: quote.clientId,
          quoteId: quote.id,
          service: quote.service,
          status: 'Planifiée',
          scheduledDate: quote.estimatedStartDate,
          estimatedStartDate: quote.estimatedStartDate,
          estimatedEndDate: quote.estimatedEndDate,
          estimatedDeliveryDate: quote.estimatedDeliveryDate,
          depositReceived: true,
          workflowStatus: 'Intervention planifiée',
          createdBy: user.id || '', createdByName: user.name || ''
        });
        quote = store.update('quotes', quote.id, { interventionId: intervention.id, workflowStatus: 'Intervention planifiée' });
      }
      communicationDraft(store, quote, `Bonjour ${client.name || ''},\n\nNous vous confirmons la réception de votre acompte. Le dépôt de ${vehicleLabel} est prévu le ${quote.proposedDropoffDate || quote.estimatedStartDate} à ${quote.proposedDropoffTime || '16:00'}, pour un démarrage d’intervention le ${quote.estimatedStartDate} à 08:30. La livraison est actuellement estimée au ${quote.estimatedDeliveryDate}.\n\nNous vous tiendrons informé de l’avancement.\n\nBien cordialement,\nGentleCarE`, `Confirmation de planification — ${vehicleLabel}`, user);
      answer = `Acompte enregistré. L’intervention ${intervention.number} est planifiée du ${quote.estimatedStartDate} au ${quote.estimatedEndDate}, livraison estimée le ${quote.estimatedDeliveryDate}.`;
      break;
    }
    case 'start': {
      if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_PLANNED'), { status: 409 });
      intervention = store.update('interventions', intervention.id, { status: 'En cours', workflowStatus: 'Véhicule en cours', startedAt: now });
      answer = `${vehicleLabel} est maintenant en cours d’intervention sous le dossier ${intervention.number}.`;
      break;
    }
    case 'delay': {
      if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_PLANNED'), { status: 409 });
      const extraDays = Math.max(1, Number(payload.extraDays || 1));
      const end = addWorkdays(new Date(`${intervention.estimatedEndDate || quote.estimatedEndDate}T12:00:00`), extraDays);
      const delivery = nextWorkday(end);
      const reason = normalize(payload.reason || 'Le traitement nécessite un temps complémentaire afin de préserver la qualité du résultat.');
      intervention = store.update('interventions', intervention.id, { workflowStatus: 'Délai ajusté', estimatedEndDate: isoDate(end), estimatedDeliveryDate: isoDate(delivery), delayReason: reason, delayUpdatedAt: now });
      quote = store.update('quotes', quote.id, { estimatedEndDate: isoDate(end), estimatedDeliveryDate: isoDate(delivery), workflowStatus: 'Délai ajusté' });
      communicationDraft(store, quote, `Bonjour ${client.name || ''},\n\nNous poursuivons le traitement de ${vehicleLabel} avec le niveau d’exigence prévu. ${reason} La livraison est désormais estimée au ${formatFrenchDate(delivery)}.\n\nNous suivons le dossier de près et nous vous contacterons immédiatement dès que le véhicule sera terminé.\n\nBien cordialement,\nGentleCarE`, `Mise à jour de l’intervention — ${vehicleLabel}`, user);
      answer = `Le délai est ajusté avec une nouvelle livraison estimée le ${isoDate(delivery)}. Un message client optimiste et professionnel est prêt à valider.`;
      break;
    }
    case 'complete': {
      if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_PLANNED'), { status: 409 });
      intervention = store.update('interventions', intervention.id, { status: 'À valider', workflowStatus: 'Intervention terminée', completedAt: now, checklist: { ...(intervention.checklist || {}), finalControl: true } });
      const report = store.create('documents', { title: `Rapport ${intervention.number}`, category: 'Rapport intervention', status: 'Brouillon bloqué — à valider', clientId: quote.clientId, vehicleId: quote.vehicleId, interventionId: intervention.id, quoteId: quote.id, url: '', createdBy: user.id || '', createdByName: user.name || '' });
      const invoice = store.create('documents', { title: `Facture à générer — ${intervention.number}`, category: 'Facture', status: 'Brouillon — à valider', clientId: quote.clientId, vehicleId: quote.vehicleId, interventionId: intervention.id, quoteId: quote.id, amountTtc: quote.totalTtc, balanceTtc: quote.balanceTtc, url: '', createdBy: user.id || '', createdByName: user.name || '' });
      store.create('tasks', { title: `Valider rapport et facture — ${intervention.number}`, status: 'À faire', priority: 'Haute', assignee: 'David / Bénédicte', interventionId: intervention.id, quoteId: quote.id, clientId: quote.clientId, vehicleId: quote.vehicleId });
      quote = store.update('quotes', quote.id, { workflowStatus: 'Rapport et facture à valider', reportId: report.id, invoiceId: invoice.id, paymentStatus: 'Solde en attente' });
      answer = `Intervention terminée. Le rapport et la facture sont créés en brouillons bloqués et attendent la validation de David ou Bénédicte. Solde attendu : ${money(quote.balanceTtc)}.`;
      break;
    }
    case 'payment-received': {
      if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_PLANNED'), { status: 409 });
      quote = store.update('quotes', quote.id, { workflowStatus: 'Règlement reçu', paymentStatus: 'Payé', balanceReceivedAt: now });
      intervention = store.update('interventions', intervention.id, { workflowStatus: 'À transférer au showroom', status: 'Préparation showroom' });
      const task = store.create('tasks', { title: `Véhicule à transférer au showroom et à faire belle — ${vehicleLabel}`, status: 'À prendre', priority: 'Haute', assignee: '', interventionId: intervention.id, quoteId: quote.id, clientId: quote.clientId, vehicleId: quote.vehicleId, instructions: 'Le collaborateur qui coche son nom prend le dossier en charge. Vérifier s’il faut nettoyer le véhicule, choisir la méthode adaptée, effectuer la mise en beauté puis poser la housse de protection.' });
      answer = `Règlement reçu. La tâche showroom est créée : « ${task.title} ». Le premier collaborateur qui renseigne son nom prend le dossier en charge.`;
      break;
    }
    case 'showroom-claim': {
      if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_PLANNED'), { status: 409 });
      const assignee = normalize(payload.assignee || user.name);
      if (!assignee) throw Object.assign(new Error('ASSIGNEE_REQUIRED'), { status: 400 });
      const task = safeList(store, 'tasks').find((item) => item.interventionId === intervention.id && /showroom|faire belle/i.test(item.title || '') && item.status !== 'Terminée');
      if (task) store.update('tasks', task.id, { status: 'En cours', assignee, claimedAt: now });
      intervention = store.update('interventions', intervention.id, { workflowStatus: 'Préparation showroom', showroomAssignee: assignee, showroomClaimedAt: now });
      answer = `${assignee} prend en charge la préparation showroom de ${vehicleLabel}.`;
      break;
    }
    case 'showroom-ready': {
      if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_PLANNED'), { status: 409 });
      const cleaningMethod = normalize(payload.cleaningMethod || 'Méthode adaptée après contrôle du véhicule');
      intervention = store.update('interventions', intervention.id, { workflowStatus: 'En attente client', status: 'En attente client', showroomReadyAt: now, cleaningMethod, protectionCoverInstalled: payload.coverInstalled !== false });
      const task = safeList(store, 'tasks').find((item) => item.interventionId === intervention.id && /showroom|faire belle/i.test(item.title || '') && item.status !== 'Terminée');
      if (task) store.update('tasks', task.id, { status: 'Terminée', completedAt: now, notes: `Nettoyage : ${cleaningMethod}. Housse : ${payload.coverInstalled === false ? 'non posée' : 'posée'}.` });
      communicationDraft(store, quote, `Bonjour ${client.name || ''},\n\n${vehicleLabel} est terminé et préparé pour sa restitution. Il est désormais protégé dans notre espace de présentation. Nous vous contactons afin de convenir de sa remise.\n\nBien cordialement,\nGentleCarE`, `${vehicleLabel} est prêt`, user);
      answer = `${vehicleLabel} est propre, protégé et en attente du client. Le message de disponibilité est prêt à valider.`;
      break;
    }
    case 'close': {
      if (intervention) intervention = store.update('interventions', intervention.id, { workflowStatus: 'Dossier clôturé', status: 'Clôturée', closedAt: now });
      quote = store.update('quotes', quote.id, { workflowStatus: 'Dossier clôturé', status: 'Accepté', closedAt: now });
      answer = `Le dossier ${quote.number} est clôturé et prêt à être archivé.`;
      break;
    }
    case 'archive': {
      if (intervention) intervention = store.update('interventions', intervention.id, { workflowStatus: 'Archivé', status: 'Archivée', archivedAt: now });
      quote = store.update('quotes', quote.id, { workflowStatus: 'Archivé', status: 'Archivé', archivedAt: now });
      answer = `Le dossier ${quote.number} est archivé avec son client, son véhicule, ses documents et son historique.`;
      break;
    }
    default: throw Object.assign(new Error('WORKFLOW_ACTION_UNKNOWN'), { status: 400 });
  }

  return { type: 'quote-workflow-transition', answer, data: { quote, intervention, state: quote.workflowStatus, states: DOSSIER_STATES } };
}

function regenerate(store, quoteReference, patch = {}, user = {}) {
  let quote = resolveQuote(store, quoteReference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const vehicle = safeList(store, 'vehicles').find((item) => item.id === quote.vehicleId);
  if (patch.photoDataUrl) {
    const photoUrl = savePhoto(patch.photoDataUrl, patch.photoName || 'vehicule.jpg');
    if (vehicle) store.update('vehicles', vehicle.id, { photoUrl });
    patch.vehiclePhotoUrl = photoUrl;
  }
  quote = store.update('quotes', quote.id, { ...patch, updatedBy: user.id || '', updatedByName: user.name || '' });
  const client = safeList(store, 'clients').find((item) => item.id === quote.clientId) || {};
  const refreshedVehicle = safeList(store, 'vehicles').find((item) => item.id === quote.vehicleId) || {};
  const missingFields = quoteMissingFields(client, refreshedVehicle, { label: quote.service, totalTtc: quote.totalTtc }, quote.vehiclePhotoUrl || refreshedVehicle.photoUrl);
  quote = store.update('quotes', quote.id, { missingFields, provisional: missingFields.length > 0, status: missingFields.length ? 'À finaliser – informations manquantes' : 'À valider', workflowStatus: missingFields.length ? 'Devis à finaliser' : 'Devis à valider', version: missingFields.length ? quote.version || '0.1' : '1.0' });
  const visual = generateVisual(store, quote);
  quote = store.update('quotes', quote.id, { visualFileName: visual.fileName, visualUrl: visual.visualUrl });
  return { quote, visualUrl: visual.visualUrl, missingFields };
}

module.exports = {
  DEPOSIT_RATE,
  DOSSIER_STATES,
  parseIntake,
  startIntake,
  transition,
  regenerate,
  resolveQuote,
  generateVisual,
  savePhoto
};
