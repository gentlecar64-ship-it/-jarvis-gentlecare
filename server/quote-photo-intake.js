'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const procedures = require('./workshop-procedures');
const tariffs = require('./tariff-catalog');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PHOTO_DIR = path.join(PUBLIC_DIR, 'generated', 'quote-intake');
const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 3_000_000;
const MAX_TOTAL_BYTES = 9_000_000;

const QUESTIONS = Object.freeze({
  voiture: [
    ['dirtyAreas', 'Quelles zones sont les plus sales ou oxydées ?', 'Dessous de caisse, passages de roues, moteur, trains roulants…'],
    ['accessConstraints', 'Des démontages ou protections particulières sont-ils nécessaires ?', 'Sabots, roues, caches, accessoires…'],
    ['dirtLevel', 'Niveau de saleté observé', 'Léger / moyen / important / très important']
  ],
  moto: [
    ['dirtyAreas', 'Quelles zones doivent être traitées ?', 'Moteur, cadre, bras oscillant, jantes, dessous…'],
    ['accessConstraints', 'Quels carénages ou accessoires gênent l’accès ?', 'Sabot, selle, valises, protections…'],
    ['dirtLevel', 'Niveau de saleté observé', 'Léger / moyen / important / très important']
  ],
  utilitaire: [
    ['dirtyAreas', 'Zones demandées', 'Dessous, passages de roues, compartiment moteur, zone de chargement…'],
    ['industrialDimensions', 'Gabarit et charge', 'Hauteur, longueur, largeur, PTAC et équipements ajoutés'],
    ['accessConstraints', 'Contraintes d’accès ou de levage', 'Hayon, groupe froid, étagères, chargement…']
  ],
  camion: [
    ['industrialSite', 'Lieu prévu pour l’intervention', 'Atelier GentleCarE ou site client'],
    ['industrialDimensions', 'Configuration et gabarit', 'Porteur, tracteur, remorque, essieux, PTAC/PTRA'],
    ['industrialEnergySources', 'Équipements et énergies à sécuriser', 'Hydraulique, pneumatique, électrique, carburant…']
  ],
  avion: [
    ['industrialSite', 'Exploitant, hangar et conditions d’accès', 'Accès piste, sûreté, FOD, maintenance'],
    ['industrialZones', 'Zone exacte demandée', 'Élément démonté, compartiment ou surface autorisée'],
    ['industrialSafetyRules', 'Autorisation et procédure aéronautique', 'Responsable maintenance, organisme agréé, documentation applicable']
  ],
  helicoptere: [
    ['industrialSite', 'Exploitant, hangar et conditions d’accès', 'Accès piste, sûreté, FOD, maintenance'],
    ['industrialZones', 'Zone exacte demandée', 'Élément démonté, compartiment ou surface autorisée'],
    ['industrialSafetyRules', 'Autorisation et procédure aéronautique', 'Responsable maintenance, organisme agréé, documentation applicable']
  ],
  industriel: [
    ['industrialSite', 'Entreprise et site d’intervention', 'Adresse, bâtiment, zone et contact sécurité'],
    ['industrialMachineFunction', 'Machine, équipement et fonction', 'Désignation, fabricant, modèle, usage et cadence'],
    ['industrialDimensions', 'Dimensions, poids et encombrement', 'Longueur, largeur, hauteur, masse et mobilité'],
    ['industrialMaterials', 'Matériaux et revêtements', 'Acier, inox, aluminium, peinture, plastique, composite…'],
    ['industrialZones', 'Zones à traiter et résultat attendu', 'Graisse, colle, peinture, calamine, résidus de production…'],
    ['industrialEnergySources', 'Énergies et organes sensibles', 'Électrique, pneumatique, hydraulique, thermique, capteurs, roulements…'],
    ['industrialConsignation', 'Consignation prévue par le site', 'Responsable habilité, arrêt, purge et vérification d’absence d’énergie'],
    ['industrialProductionConstraints', 'Contraintes de production', 'Fenêtre d’arrêt, remise en service, qualité et délais'],
    ['industrialAccessMeans', 'Moyens d’accès nécessaires', 'Balisage, nacelle, échafaudage, levage, ventilation…'],
    ['industrialWasteRecovery', 'Déchets, ventilation et confinement', 'Récupération, aspiration, zone alimentaire ou ATEX'],
    ['industrialSafetyRules', 'Règles du site et documents disponibles', 'Plan de prévention, FDS, permis, EPI, assurance…'],
    ['dirtLevel', 'Niveau et nature de l’encrassement', 'Léger / moyen / important / très important, épaisseur et adhérence']
  ],
  autre: [
    ['industrialMachineFunction', 'Objet et usage', 'Décrire précisément ce qui doit être traité'],
    ['industrialMaterials', 'Matériaux et surfaces', 'Revêtements, fragilités et incompatibilités possibles'],
    ['industrialZones', 'Zones et résultat attendu', 'Photographies et critères d’acceptation']
  ]
});

function text(value) { return String(value || '').trim(); }
function normalize(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function ensureDir() { fs.mkdirSync(PHOTO_DIR, { recursive: true }); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function categoryFromText(value) {
  const normalized = normalize(value);
  if (!normalized) return '';
  for (const category of procedures.categories()) if ((category.aliases || []).some((alias) => normalized.includes(normalize(alias)))) return category.key;
  return '';
}
function registrationFromText(value) {
  const upper = text(value).toUpperCase();
  const modern = upper.match(/\b[A-Z]{2}[ -]?\d{3}[ -]?[A-Z]{2}\b/);
  if (modern) return modern[0].replace(/\s+/g, '-');
  const old = upper.match(/\b\d{1,4}[ -]?[A-Z]{1,3}[ -]?\d{2,3}\b/);
  return old ? old[0].replace(/\s+/g, '-') : '';
}
function savePhoto(photo = {}, index = 0) {
  const match = String(photo.dataUrl || '').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw Object.assign(new Error('PHOTO_FORMAT_INVALID'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_PHOTO_BYTES) throw Object.assign(new Error('PHOTO_TOO_LARGE'), { status: 413 });
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const base = text(photo.name || `photo-${index + 1}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || `photo-${index + 1}`;
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}.${ext}`;
  ensureDir();
  fs.writeFileSync(path.join(PHOTO_DIR, filename), buffer);
  return { url: `/generated/quote-intake/${filename}`, bytes: buffer.length, name: text(photo.name), role: text(photo.role || (index === 0 ? 'Vue générale' : 'Zone à traiter')), dominantColor: text(photo.dominantColor), detectedText: text(photo.detectedText) };
}
function pricingFor(category) {
  const records = tariffs.list().filter((item) => item.vehicleType === category || item.vehicleType === 'autre');
  const fixed = records.filter((item) => Number(item.totalTtc || 0) > 0).map((item) => Number(item.totalTtc));
  return {
    records: records.map((item) => ({ key: item.key, label: item.label, pricingMode: item.pricingMode, totalTtc: Number(item.totalTtc || 0), hourlyRateHt: Number(item.hourlyRateHt || 0), tariffSource: item.tariffSource })),
    minimumTtc: fixed.length ? Math.min(...fixed) : 0,
    maximumTtc: fixed.length ? Math.max(...fixed) : 0,
    requiresDirectionPrice: !fixed.length
  };
}
function intakeQuestions(category) {
  return (QUESTIONS[category] || QUESTIONS.autre).map(([key, label, help]) => ({ key, label, help }));
}
function analyze(store, input = {}, user = {}) {
  const photos = Array.isArray(input.photos) ? input.photos.slice(0, MAX_PHOTOS) : [];
  if (!photos.length) throw Object.assign(new Error('FIRST_PHOTO_REQUIRED'), { status: 409, missingFields: ['photo générale'] });
  let total = 0;
  const saved = photos.map((photo, index) => {
    const record = savePhoto(photo, index);
    total += record.bytes;
    if (total > MAX_TOTAL_BYTES) throw Object.assign(new Error('PHOTOS_TOTAL_TOO_LARGE'), { status: 413 });
    return record;
  });
  const evidenceText = [input.requestCategory, input.vehicleType, input.notes, input.brand, input.model, ...saved.map((item) => `${item.name} ${item.detectedText}`)].join(' ');
  const category = procedures.normalizeType(input.requestCategory || input.vehicleType) || categoryFromText(evidenceText);
  const registration = text(input.registration) || registrationFromText(saved.map((item) => `${item.detectedText} ${item.name}`).join(' '));
  const dominantColor = text(input.color) || saved.find((item) => item.dominantColor)?.dominantColor || '';
  const analysis = {
    mode: 'guided-local',
    category: category || '',
    categoryConfidence: category ? (procedures.normalizeType(input.requestCategory || input.vehicleType) ? 'confirmée par l’utilisateur' : 'suggestion issue du texte ou du nom de fichier') : 'à confirmer',
    registration,
    registrationSource: registration ? 'texte détecté par le navigateur ou nom du fichier — confirmation humaine obligatoire' : 'non détectée automatiquement',
    color: dominantColor,
    colorSource: dominantColor ? 'couleur dominante de la photo — confirmation humaine obligatoire' : 'à renseigner',
    dirtLevel: text(input.dirtLevel),
    dirtyAreas: text(input.dirtyAreas),
    limitations: 'Sans service de vision configuré, MAVIK conserve et classe les photos mais ne prétend pas reconnaître de façon certaine le modèle, la plaque ou la saleté. L’utilisateur confirme les suggestions avant le devis.',
    analyzedAt: new Date().toISOString(),
    analyzedBy: user.name || user.id || 'MAVIK'
  };
  for (const photo of saved) {
    try {
      store.create('photos', {
        title: `${photo.role} — demande de devis`, url: photo.url, category: 'Photo devis — visite client',
        clientId: text(input.clientId), vehicleId: text(input.vehicleId), quoteRequestId: text(input.requestId),
        role: photo.role, dominantColor: photo.dominantColor, detectedText: photo.detectedText,
        createdBy: user.id || '', createdByName: user.name || ''
      });
    } catch {}
  }
  return {
    photos: saved.map(({ bytes, ...photo }) => photo),
    analysis,
    suggestedFields: { requestCategory: category || '', vehicleType: category || '', registration, color: dominantColor },
    questions: intakeQuestions(category || 'autre'),
    pricing: pricingFor(category || 'autre'),
    procedure: procedures.snapshot(category || 'autre')
  };
}

module.exports = { MAX_PHOTOS, QUESTIONS, intakeQuestions, pricingFor, analyze };
