'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const REPORT_DIR = path.join(PUBLIC_DIR, 'generated', 'reports');
const LOGO_DIR = path.join(__dirname, 'assets', 'logo');
const REPORT_SCHEMA_VERSION = '1.0';

function ensureDir() { fs.mkdirSync(REPORT_DIR, { recursive: true }); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function text(value, fallback = '') { const out = String(value ?? '').trim(); return out || fallback; }
function list(value) { return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null && String(item).trim() !== '') : value ? [value] : []; }
function number(value) { const out = Number(value); return Number.isFinite(out) ? out : 0; }
function iso(value = new Date()) { try { return new Date(value).toISOString(); } catch { return new Date().toISOString(); } }
function dateOnly(value) { return value ? String(value).slice(0, 10) : '' ; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function slug(value, fallback = 'rapport') { const out = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return out || fallback; }
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function officialLogoBase64() { try { return fs.readdirSync(LOGO_DIR).filter((name) => /^\d+\.txt$/.test(name)).sort().map((name) => fs.readFileSync(path.join(LOGO_DIR, name), 'utf8').trim()).join(''); } catch { return ''; } }

function findRecord(store, collection, id) { return safeList(store, collection).find((item) => item.id === id) || null; }
function reportDocuments(store, interventionId) { return safeList(store, 'documents').filter((item) => item.interventionId === interventionId && item.category === 'Rapport intervention'); }
function nextVersion(store, interventionId) {
  const versions = reportDocuments(store, interventionId).map((item) => number(item.reportVersion)).filter(Boolean);
  return (versions.length ? Math.max(...versions) : 0) + 1;
}
function reportNumber(intervention) { return `RAP-${text(intervention.number, `INT-${String(intervention.id || '').slice(0, 8)}`).replace(/^GC-/, '')}`; }

function photoRecords(store, intervention, vehicle, quote) {
  return safeList(store, 'photos').filter((item) => [intervention.id, vehicle.id, quote?.id].filter(Boolean).some((id) => [item.interventionId, item.vehicleId, item.quoteId].includes(id)));
}
function evidenceDocuments(store, intervention, vehicle, quote) {
  return safeList(store, 'documents').filter((item) => item.id !== quote?.reportId && [intervention.id, vehicle.id, quote?.id].filter(Boolean).some((id) => [item.interventionId, item.vehicleId, item.quoteId].includes(id)));
}
function observationRecords(store, intervention) { return safeList(store, 'observations').filter((item) => item.interventionId === intervention.id); }

function photoByCategory(photos, expressions) {
  const patterns = expressions.map((value) => new RegExp(value, 'i'));
  return photos.filter((photo) => patterns.some((pattern) => pattern.test(`${photo.category || ''} ${photo.title || ''} ${photo.zone || ''} ${photo.stage || ''}`)));
}

function sourceValue(primary, secondary, fallback = '') { return primary !== undefined && primary !== null && primary !== '' ? primary : secondary !== undefined && secondary !== null && secondary !== '' ? secondary : fallback; }
function productList(value) {
  return list(value).map((item) => typeof item === 'object' ? {
    name: text(item.name || item.product, 'Produit à préciser'),
    batch: text(item.batch || item.lot, 'Lot à renseigner'),
    quantity: number(item.quantity),
    unit: text(item.unit, 'unité')
  } : { name: text(item), batch: 'Lot à renseigner', quantity: 0, unit: 'unité' });
}

function completeness(report) {
  const missing = [];
  const requireText = (value, label) => { if (!text(value)) missing.push(label); };
  requireText(report.identification.client.name, 'identité du client');
  requireText(report.identification.vehicle.makeModel, 'marque et modèle');
  requireText(report.identification.vehicle.registration, 'immatriculation');
  if (!report.identification.vehicle.mileage) missing.push('kilométrage d’entrée');
  requireText(report.mission.request, 'demande du client');
  if (!report.mission.plannedZones.length) missing.push('zones prévues');
  if (!report.entryCondition.photos.length) missing.push('photos horodatées de l’état d’entrée');
  requireText(report.preDiagnosis.depositNature, 'nature des dépôts');
  if (!report.cryogenicProtocol.zonesTreated.length && !report.dinitrolProtection.appliedZones.length) missing.push('zones réellement traitées');
  if (!report.comparisons.length) missing.push('comparaisons avant/après');
  requireText(report.finalControl.managerValidation, 'validation du responsable');
  return { complete: missing.length === 0, missing };
}

function build(store, interventionReference, patch = {}, actor = {}) {
  const intervention = typeof interventionReference === 'object' ? interventionReference : findRecord(store, 'interventions', interventionReference);
  if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_FOUND'), { status: 404 });
  const quote = findRecord(store, 'quotes', intervention.quoteId) || {};
  const vehicle = findRecord(store, 'vehicles', intervention.vehicleId || quote.vehicleId) || {};
  const client = findRecord(store, 'clients', intervention.clientId || quote.clientId || vehicle.clientId) || {};
  const photos = photoRecords(store, intervention, vehicle, quote);
  const observations = observationRecords(store, intervention);
  const documents = evidenceDocuments(store, intervention, vehicle, quote);
  const version = nextVersion(store, intervention.id);
  const generatedAt = iso();
  const beforePhotos = photoByCategory(photos, ['entrée', 'entree', 'avant', 'réception', 'reception']);
  const afterPhotos = photoByCategory(photos, ['après', 'apres', 'final', 'sortie']);
  const comparisonZones = list(sourceValue(patch.comparisons, intervention.comparisons, []));
  const inferredComparisons = comparisonZones.length ? comparisonZones : [...new Set([...beforePhotos, ...afterPhotos].map((item) => text(item.zone)).filter(Boolean))].map((zone) => ({
    zone,
    beforePhotoUrl: beforePhotos.find((item) => text(item.zone) === zone)?.url || '',
    afterPhotoUrl: afterPhotos.find((item) => text(item.zone) === zone)?.url || '',
    technicalComment: '',
    remainingVisible: ''
  }));

  const marketValue = Math.max(number(vehicle.expertCurrentValue), number(vehicle.currentConditionValue), number(vehicle.marketValueAverage), number(vehicle.clientEstimatedValue));
  const raritySuspected = Boolean(vehicle.isRareVehicle || vehicle.raritySuspected || /rare|collection|série limitée|serie limitee/i.test(`${vehicle.notes || ''} ${vehicle.trim || ''} ${vehicle.version || ''}`));
  const expertRecommended = Boolean(sourceValue(patch.expertReviewRecommended, intervention.expertReviewRecommended, marketValue > 50000 || raritySuspected || observations.some((item) => /litige|structure|corrosion perforante|expert/i.test(`${item.description || ''} ${item.notes || ''}`))));

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportNumber: reportNumber(intervention),
    version,
    generatedAt,
    generatedBy: { id: actor.id || '', name: actor.name || actor.username || 'MAVIK/Jarvis' },
    status: text(patch.status || intervention.reportStatus, 'Brouillon bloqué — à valider'),
    identification: {
      client: { id: client.id || '', name: text(client.name, 'À renseigner'), email: text(client.email), mobile: text(client.mobile || client.phone), address: text(client.address) },
      vehicle: {
        id: vehicle.id || '', makeModel: text([vehicle.brand, vehicle.model].filter(Boolean).join(' '), 'À renseigner'),
        registration: text(vehicle.registration), vin: text(vehicle.vin), mileage: number(sourceValue(patch.mileage, intervention.mileage, vehicle.mileage)),
        year: text(vehicle.year), color: text(vehicle.color), engine: text(vehicle.engine), version: text(vehicle.version || vehicle.trim)
      },
      intervention: { id: intervention.id, number: text(intervention.number), quoteNumber: text(quote.number), service: text(intervention.service || quote.service), startedAt: text(intervention.startedAt || intervention.estimatedStartDate), completedAt: text(intervention.completedAt), technicians: list(sourceValue(patch.technicians, intervention.technicians, intervention.technician || actor.name)) },
      reportVersion: `v${version}.0`
    },
    mission: {
      request: text(sourceValue(patch.clientRequest, intervention.clientRequest, quote.notes || quote.service)),
      plannedZones: list(sourceValue(patch.plannedZones, intervention.plannedZones, quote.plannedZones)),
      exclusions: list(sourceValue(patch.exclusions, intervention.exclusions, quote.exclusions)),
      authorizedDisassembly: list(sourceValue(patch.authorizedDisassembly, intervention.authorizedDisassembly, quote.authorizedDisassembly)),
      objectives: list(sourceValue(patch.objectives, intervention.objectives, quote.objectives || quote.service))
    },
    entryCondition: {
      observedAt: text(sourceValue(patch.entryObservedAt, intervention.entryObservedAt, intervention.startedAt)),
      photos: beforePhotos.map((item) => ({ id: item.id, title: text(item.title), zone: text(item.zone), url: text(item.url), capturedAt: text(item.capturedAt || item.createdAt), hash: text(item.hash) })),
      contradictoryObservations: list(sourceValue(patch.contradictoryObservations, intervention.contradictoryObservations, intervention.entryObservations)),
      visibleDamage: list(sourceValue(patch.visibleDamage, intervention.visibleDamage, intervention.entryDamage)),
      visibleCorrosion: list(sourceValue(patch.visibleCorrosion, intervention.visibleCorrosion, intervention.entryCorrosion)),
      reservations: list(sourceValue(patch.entryReservations, intervention.entryReservations, quote.reservations))
    },
    preDiagnosis: {
      depositNature: text(sourceValue(patch.depositNature, intervention.depositNature)),
      supportCompatibility: list(sourceValue(patch.supportCompatibility, intervention.supportCompatibility)),
      testsPerformed: list(sourceValue(patch.testsPerformed, intervention.testsPerformed)),
      identifiedRisks: list(sourceValue(patch.identifiedRisks, intervention.identifiedRisks)),
      limits: list(sourceValue(patch.diagnosticLimits, intervention.diagnosticLimits)),
      preWorkRecommendations: list(sourceValue(patch.preWorkRecommendations, intervention.preWorkRecommendations))
    },
    cryogenicProtocol: {
      machine: text(sourceValue(patch.cryoMachine, intervention.cryoMachine)),
      nozzles: list(sourceValue(patch.cryoNozzles, intervention.cryoNozzles)),
      pressureMinBar: number(sourceValue(patch.pressureMinBar, intervention.pressureMinBar)),
      pressureMaxBar: number(sourceValue(patch.pressureMaxBar, intervention.pressureMaxBar)),
      zonesTreated: list(sourceValue(patch.cryoZonesTreated, intervention.cryoZonesTreated)),
      durationMinutes: number(sourceValue(patch.cryoDurationMinutes, intervention.cryoDurationMinutes)),
      dryIceKg: number(sourceValue(patch.dryIceKg, intervention.dryIceKg)),
      incidents: list(sourceValue(patch.cryoIncidents, intervention.cryoIncidents))
    },
    dinitrolProtection: {
      products: productList(sourceValue(patch.dinitrolProducts, intervention.dinitrolProducts)),
      maskedZones: list(sourceValue(patch.maskedZones, intervention.maskedZones)),
      cavities: list(sourceValue(patch.cavities, intervention.cavities)),
      appliedZones: list(sourceValue(patch.dinitrolZones, intervention.dinitrolZones)),
      totalQuantity: text(sourceValue(patch.dinitrolTotalQuantity, intervention.dinitrolTotalQuantity)),
      applicationConditions: text(sourceValue(patch.applicationConditions, intervention.applicationConditions)),
      dryingTime: text(sourceValue(patch.dryingTime, intervention.dryingTime))
    },
    comparisons: inferredComparisons.map((item) => ({
      zone: text(item.zone, 'Zone à préciser'), beforePhotoUrl: text(item.beforePhotoUrl || item.before), afterPhotoUrl: text(item.afterPhotoUrl || item.after),
      technicalComment: text(item.technicalComment || item.comment), remainingVisible: text(item.remainingVisible)
    })),
    anomalies: observations.map((item) => ({
      id: item.id, category: text(item.category || item.type, 'Observation'), severity: text(item.severity, 'À surveiller'),
      description: text(item.description || item.notes || item.title), zone: text(item.zone), photoUrl: text(item.photoUrl),
      clientNotified: item.clientNotified === true, decision: text(item.decision), specialistRecommended: Boolean(item.specialistRecommended || /spécialiste|specialiste|expert/i.test(`${item.decision || ''} ${item.notes || ''}`))
    })),
    finalControl: {
      checklist: { ...(intervention.checklist || {}), ...(patch.finalChecklist || {}) },
      quoteCompliance: text(sourceValue(patch.quoteCompliance, intervention.quoteCompliance)),
      reservations: list(sourceValue(patch.finalReservations, intervention.finalReservations)),
      finalCleaning: text(sourceValue(patch.finalCleaning, intervention.finalCleaning || intervention.cleaningMethod)),
      managerValidation: text(sourceValue(patch.managerValidation, intervention.managerValidation)),
      validatedAt: text(sourceValue(patch.validatedAt, intervention.reportValidatedAt))
    },
    adviceAndFollowUp: {
      recommendations: list(sourceValue(patch.recommendations, intervention.recommendations)),
      nextControlDate: dateOnly(sourceValue(patch.nextControlDate, intervention.nextControlDate)),
      retouches: list(sourceValue(patch.retouches, intervention.retouches)),
      monitoring: list(sourceValue(patch.monitoring, intervention.monitoring)),
      warrantyLimits: list(sourceValue(patch.warrantyLimits, intervention.warrantyLimits))
    },
    evidence: {
      quote: quote.id ? { id: quote.id, number: text(quote.number), status: text(quote.status), visualUrl: text(quote.visualUrl), acceptedAt: text(quote.acceptedAt) } : null,
      validations: list(sourceValue(patch.validations, intervention.validations)),
      media: photos.map((item) => ({ id: item.id, title: text(item.title), category: text(item.category), zone: text(item.zone), url: text(item.url), createdAt: text(item.createdAt), hash: text(item.hash) })),
      consumptions: { dryIceKg: number(sourceValue(patch.dryIceKg, intervention.dryIceKg)), dinitrol: productList(sourceValue(patch.dinitrolProducts, intervention.dinitrolProducts)) },
      productSheets: documents.filter((item) => /fiche|produit|sécurité|securite/i.test(`${item.category || ''} ${item.title || ''}`)).map((item) => ({ id: item.id, title: item.title, url: item.url })),
      signatures: list(sourceValue(patch.signatures, intervention.signatures)),
      relatedDocuments: documents.map((item) => ({ id: item.id, title: item.title, category: item.category, status: item.status, url: item.url })),
      versionHistory: reportDocuments(store, intervention.id).map((item) => ({ version: item.reportVersion, generatedAt: item.generatedAt || item.createdAt, hash: item.contentHash, status: item.status, url: item.url }))
    },
    complementaryVisa: {
      recommended: expertRecommended,
      reason: text(sourceValue(patch.expertReviewReason, intervention.expertReviewReason, expertRecommended ? marketValue > 50000 ? 'Valeur estimée supérieure à 50 000 €.' : raritySuspected ? 'Rareté potentielle à confirmer.' : 'Nature des constats justifiant un regard indépendant.' : 'Non requis à ce stade.')),
      status: text(sourceValue(patch.expertReviewStatus, intervention.expertReviewStatus, expertRecommended ? 'À décider par l’humain' : 'Non requis')),
      professionalName: text(sourceValue(patch.expertName, intervention.expertName)),
      professionalCapacity: text(sourceValue(patch.expertCapacity, intervention.expertCapacity)),
      visaText: text(sourceValue(patch.expertVisaText, intervention.expertVisaText)),
      visaDate: text(sourceValue(patch.expertVisaDate, intervention.expertVisaDate)),
      independent: true,
      disclaimer: 'Le rapport GentleCarE décrit l’intervention et les constats observés. Il ne remplace pas une expertise automobile indépendante.'
    }
  };
  report.completeness = completeness(report);
  report.contentHash = hash(report);
  return { report, intervention, quote, vehicle, client };
}

function value(value, fallback = 'Non renseigné') { return text(value, fallback); }
function renderList(items, fallback = 'Aucun élément renseigné.') { const values = list(items); return values.length ? `<ul>${values.map((item) => `<li>${escapeHtml(typeof item === 'object' ? JSON.stringify(item) : item)}</li>`).join('')}</ul>` : `<p class="empty">${escapeHtml(fallback)}</p>`; }
function renderPhotos(items) { const photos = list(items); return photos.length ? `<div class="photos">${photos.map((item) => `<figure>${item.url ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title || item.zone || 'Photo')}">` : '<div class="photo-missing">Photo non disponible</div>'}<figcaption>${escapeHtml(item.zone || item.title || 'Zone')}<small>${escapeHtml(item.capturedAt || item.createdAt || '')}</small></figcaption></figure>`).join('')}</div>` : '<p class="empty">Aucune photo rattachée.</p>'; }
function section(numberValue, title, body) { return `<section><div class="section-title"><span>${numberValue}</span><h2>${escapeHtml(title)}</h2></div>${body}</section>`; }

function renderHtml(report) {
  const logo = officialLogoBase64();
  const id = report.identification;
  const cryo = report.cryogenicProtocol;
  const dinitrol = report.dinitrolProtection;
  const anomalies = report.anomalies;
  const comparisons = report.comparisons;
  const missing = report.completeness.missing;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.reportNumber)} — Rapport d’intervention</title><style>
  :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#10212a;background:#edf3f5}*{box-sizing:border-box}body{margin:0;padding:24px}.report{max-width:1100px;margin:auto;background:white;box-shadow:0 24px 80px rgba(7,20,28,.18)}header{padding:34px 42px;color:#edf7fb;background:linear-gradient(135deg,#07141c,#153b49 68%,#42672f);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center}header img{width:260px;max-height:130px;object-fit:contain}header h1{font-size:33px;margin:6px 0}.kicker{text-transform:uppercase;letter-spacing:1.8px;color:#a9d47b;font-size:11px}.meta{color:#bfd0d7;font-size:13px}.status{display:inline-block;padding:7px 12px;border-radius:999px;background:#8b632d;font-weight:800;font-size:12px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:22px 42px;background:#f5f8f9;border-bottom:1px solid #dfe9ed}.summary div{padding:13px;border:1px solid #dce7eb;border-radius:12px}.summary small{display:block;text-transform:uppercase;color:#607985;font-weight:700}.summary strong{display:block;margin-top:5px}.content{padding:12px 42px 42px}section{padding:25px 0;border-bottom:1px solid #dfe8eb}.section-title{display:flex;align-items:center;gap:12px;margin-bottom:14px}.section-title span{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:#183c49;color:white;font-weight:900}.section-title h2{margin:0;font-size:21px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid #dfe8eb;border-radius:12px;padding:14px;background:#fafcfc}.card h3{font-size:12px;text-transform:uppercase;color:#54707b;margin:0 0 8px}.card p{margin:0;white-space:pre-wrap}.empty{color:#8b632d;font-style:italic}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.photos figure{margin:0;border:1px solid #dfe8eb;border-radius:12px;overflow:hidden}.photos img,.photo-missing{width:100%;height:190px;object-fit:cover;background:#e7eef1;display:grid;place-items:center}.photos figcaption{padding:9px;font-weight:700}.photos small{display:block;color:#78909a;font-weight:400;margin-top:4px}.comparison{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:10px;margin-bottom:12px}.comparison img{width:100%;height:170px;object-fit:cover;border-radius:10px;background:#e7eef1}.alert{padding:14px;border-radius:12px;background:#fff4dc;border:1px solid #e4bd69}.ok{background:#e9f6e7;border-color:#91bc5b}.anomaly{padding:13px;border-left:5px solid #ffcf72;background:#fffaf0;margin:10px 0}.anomaly.high{border-color:#ff827a}.evidence{font-size:13px}.hash{font-family:monospace;overflow-wrap:anywhere;font-size:11px;color:#607985}footer{padding:22px 42px;background:#07141c;color:#abc0c9;font-size:12px}ul{margin:7px 0;padding-left:20px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #dfe8eb;vertical-align:top}@media(max-width:760px){body{padding:0}.report{box-shadow:none}header{grid-template-columns:1fr;padding:25px 20px}header img{width:220px}.summary,.grid,.comparison{grid-template-columns:1fr}.summary,.content,footer{padding-left:20px;padding-right:20px}.photos{grid-template-columns:1fr 1fr}}@media print{body{padding:0;background:white}.report{box-shadow:none}section{break-inside:avoid}.photos figure{break-inside:avoid}}
  </style></head><body><article class="report"><header><div><div class="kicker">Rapport d’intervention de référence · dossier technique du véhicule</div><h1>${escapeHtml(report.reportNumber)}</h1><div class="meta">Version ${escapeHtml(id.reportVersion)} · générée le ${escapeHtml(new Date(report.generatedAt).toLocaleString('fr-FR'))} · par ${escapeHtml(report.generatedBy.name)}</div><p><span class="status">${escapeHtml(report.status)}</span></p></div>${logo ? `<img src="data:image/png;base64,${logo}" alt="GentleCarE">` : ''}</header>
  <div class="summary"><div><small>Client</small><strong>${escapeHtml(id.client.name)}</strong></div><div><small>Véhicule</small><strong>${escapeHtml(id.vehicle.makeModel)}</strong></div><div><small>Dossier</small><strong>${escapeHtml(id.intervention.number || id.intervention.quoteNumber)}</strong></div></div><main class="content">
  ${missing.length ? `<div class="alert"><strong>Rapport à compléter avant validation</strong>${renderList(missing)}</div>` : '<div class="alert ok"><strong>Les champs structurants sont renseignés. La validation humaine reste obligatoire.</strong></div>'}
  ${section(1, 'Identification', `<div class="grid"><div class="card"><h3>Client</h3><p>${escapeHtml(id.client.name)}\n${escapeHtml(id.client.email)}\n${escapeHtml(id.client.mobile)}\n${escapeHtml(id.client.address)}</p></div><div class="card"><h3>Véhicule</h3><p>${escapeHtml(id.vehicle.makeModel)} · ${escapeHtml(id.vehicle.year)} · ${escapeHtml(id.vehicle.color)}\nImmatriculation : ${escapeHtml(value(id.vehicle.registration))}\nVIN : ${escapeHtml(value(id.vehicle.vin))}\nKilométrage : ${id.vehicle.mileage ? escapeHtml(id.vehicle.mileage.toLocaleString('fr-FR')) + ' km' : 'Non renseigné'}\nMoteur/version : ${escapeHtml([id.vehicle.engine,id.vehicle.version].filter(Boolean).join(' · ') || 'Non renseigné')}</p></div><div class="card"><h3>Intervention</h3><p>${escapeHtml(id.intervention.service)}\nDébut : ${escapeHtml(value(id.intervention.startedAt))}\nFin : ${escapeHtml(value(id.intervention.completedAt))}</p></div><div class="card"><h3>Intervenants</h3>${renderList(id.intervention.technicians)}</div></div>`)}
  ${section(2, 'Mission et périmètre', `<div class="card"><h3>Demande du client</h3><p>${escapeHtml(value(report.mission.request))}</p></div><div class="grid"><div class="card"><h3>Zones prévues</h3>${renderList(report.mission.plannedZones)}</div><div class="card"><h3>Objectifs</h3>${renderList(report.mission.objectives)}</div><div class="card"><h3>Exclusions</h3>${renderList(report.mission.exclusions)}</div><div class="card"><h3>Démontages autorisés</h3>${renderList(report.mission.authorizedDisassembly)}</div></div>`)}
  ${section(3, 'État d’entrée', `<p>Constat effectué : ${escapeHtml(value(report.entryCondition.observedAt))}</p>${renderPhotos(report.entryCondition.photos)}<div class="grid"><div class="card"><h3>Observations contradictoires</h3>${renderList(report.entryCondition.contradictoryObservations)}</div><div class="card"><h3>Dommages visibles</h3>${renderList(report.entryCondition.visibleDamage)}</div><div class="card"><h3>Corrosion apparente</h3>${renderList(report.entryCondition.visibleCorrosion)}</div><div class="card"><h3>Réserves</h3>${renderList(report.entryCondition.reservations)}</div></div>`)}
  ${section(4, 'Diagnostic préalable', `<div class="card"><h3>Nature des dépôts</h3><p>${escapeHtml(value(report.preDiagnosis.depositNature))}</p></div><div class="grid"><div class="card"><h3>Compatibilité des supports</h3>${renderList(report.preDiagnosis.supportCompatibility)}</div><div class="card"><h3>Essais réalisés</h3>${renderList(report.preDiagnosis.testsPerformed)}</div><div class="card"><h3>Risques identifiés</h3>${renderList(report.preDiagnosis.identifiedRisks)}</div><div class="card"><h3>Limites et recommandations</h3>${renderList([...report.preDiagnosis.limits,...report.preDiagnosis.preWorkRecommendations])}</div></div>`)}
  ${section(5, 'Protocole cryogénique', `<table><tr><th>Machine</th><td>${escapeHtml(value(cryo.machine))}</td></tr><tr><th>Buses</th><td>${escapeHtml(cryo.nozzles.join(', ') || 'Non renseignées')}</td></tr><tr><th>Pression</th><td>${cryo.pressureMinBar || cryo.pressureMaxBar ? `${cryo.pressureMinBar || '?'} à ${cryo.pressureMaxBar || '?'} bar` : 'Non renseignée'}</td></tr><tr><th>Temps</th><td>${cryo.durationMinutes ? `${cryo.durationMinutes} minutes` : 'Non renseigné'}</td></tr><tr><th>Glace consommée</th><td>${cryo.dryIceKg ? `${cryo.dryIceKg} kg` : 'Non renseignée'}</td></tr></table><div class="grid"><div class="card"><h3>Zones traitées</h3>${renderList(cryo.zonesTreated)}</div><div class="card"><h3>Incidents</h3>${renderList(cryo.incidents, 'Aucun incident déclaré.')}</div></div>`)}
  ${section(6, 'Protection Dinitrol', `<table><thead><tr><th>Produit</th><th>Lot</th><th>Quantité</th></tr></thead><tbody>${dinitrol.products.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.batch)}</td><td>${item.quantity ? escapeHtml(`${item.quantity} ${item.unit}`) : 'À renseigner'}</td></tr>`).join('') || '<tr><td colspan="3">Aucun produit renseigné.</td></tr>'}</tbody></table><div class="grid"><div class="card"><h3>Zones masquées</h3>${renderList(dinitrol.maskedZones)}</div><div class="card"><h3>Corps creux</h3>${renderList(dinitrol.cavities)}</div><div class="card"><h3>Zones protégées</h3>${renderList(dinitrol.appliedZones)}</div><div class="card"><h3>Conditions et séchage</h3><p>${escapeHtml(value(dinitrol.applicationConditions))}\nQuantité totale : ${escapeHtml(value(dinitrol.totalQuantity))}\nSéchage : ${escapeHtml(value(dinitrol.dryingTime))}</p></div></div>`)}
  ${section(7, 'Avant / après', comparisons.length ? comparisons.map((item) => `<div class="comparison"><div>${item.beforePhotoUrl ? `<img src="${escapeHtml(item.beforePhotoUrl)}" alt="Avant ${escapeHtml(item.zone)}">` : '<div class="photo-missing">Avant manquant</div>'}<strong>Avant · ${escapeHtml(item.zone)}</strong></div><div>${item.afterPhotoUrl ? `<img src="${escapeHtml(item.afterPhotoUrl)}" alt="Après ${escapeHtml(item.zone)}">` : '<div class="photo-missing">Après manquant</div>'}<strong>Après · ${escapeHtml(item.zone)}</strong></div><div class="card"><h3>Commentaire technique</h3><p>${escapeHtml(value(item.technicalComment))}</p><h3>Éléments restant visibles</h3><p>${escapeHtml(value(item.remainingVisible))}</p></div></div>`).join('') : '<p class="empty">Comparaisons à préparer par zone.</p>')}
  ${section(8, 'Anomalies révélées', anomalies.length ? anomalies.map((item) => `<div class="anomaly ${/grave|haute|critique/i.test(item.severity) ? 'high' : ''}"><strong>${escapeHtml(item.category)} · ${escapeHtml(item.severity)}</strong><p>${escapeHtml(value(item.description))}</p><small>Zone : ${escapeHtml(value(item.zone))} · Client informé : ${item.clientNotified ? 'oui' : 'non'} · Décision : ${escapeHtml(value(item.decision))}</small></div>`).join('') : '<p class="empty">Aucune anomalie enregistrée. Cette mention ne vaut pas absence d’anomalie non visible.</p>')}
  ${section(9, 'Contrôle final', `<div class="grid"><div class="card"><h3>Check-list</h3>${renderList(Object.entries(report.finalControl.checklist).map(([key, done]) => `${done ? '✓' : '○'} ${key}`))}</div><div class="card"><h3>Conformité au devis</h3><p>${escapeHtml(value(report.finalControl.quoteCompliance))}</p></div><div class="card"><h3>Réserves finales</h3>${renderList(report.finalControl.reservations)}</div><div class="card"><h3>Nettoyage et validation</h3><p>${escapeHtml(value(report.finalControl.finalCleaning))}\nResponsable : ${escapeHtml(value(report.finalControl.managerValidation))}\nDate : ${escapeHtml(value(report.finalControl.validatedAt))}</p></div></div>`)}
  ${section(10, 'Conseils et suivi', `<div class="grid"><div class="card"><h3>Préconisations</h3>${renderList(report.adviceAndFollowUp.recommendations)}</div><div class="card"><h3>Prochain contrôle</h3><p>${escapeHtml(value(report.adviceAndFollowUp.nextControlDate))}</p></div><div class="card"><h3>Retouches et surveillance</h3>${renderList([...report.adviceAndFollowUp.retouches,...report.adviceAndFollowUp.monitoring])}</div><div class="card"><h3>Limites de garantie</h3>${renderList(report.adviceAndFollowUp.warrantyLimits)}</div></div>`)}
  ${section(11, 'Pièces et preuves', `<div class="evidence"><p><strong>Devis :</strong> ${escapeHtml(report.evidence.quote?.number || 'Non rattaché')} · ${escapeHtml(report.evidence.quote?.status || '')}</p><p><strong>Médias :</strong> ${report.evidence.media.length} · <strong>Documents liés :</strong> ${report.evidence.relatedDocuments.length} · <strong>Fiches produits :</strong> ${report.evidence.productSheets.length}</p><h3>Historique des versions</h3>${renderList(report.evidence.versionHistory.map((item) => `v${item.version} · ${item.generatedAt || ''} · ${item.status || ''} · ${item.hash || ''}`), 'Première version du rapport.')}<p class="hash"><strong>Empreinte SHA-256 de cette version :</strong> ${escapeHtml(report.contentHash)}</p></div>`)}
  ${section(12, 'Visa complémentaire', `<div class="alert ${report.complementaryVisa.recommended ? '' : 'ok'}"><strong>${report.complementaryVisa.recommended ? 'Examen complémentaire recommandé ou à décider' : 'Visa complémentaire non requis à ce stade'}</strong><p>${escapeHtml(report.complementaryVisa.reason)}</p><p>Statut : ${escapeHtml(report.complementaryVisa.status)}</p>${report.complementaryVisa.professionalName ? `<p>Professionnel : ${escapeHtml(report.complementaryVisa.professionalName)} · ${escapeHtml(report.complementaryVisa.professionalCapacity)}</p>` : ''}${report.complementaryVisa.visaText ? `<p>${escapeHtml(report.complementaryVisa.visaText)}</p>` : ''}<small>${escapeHtml(report.complementaryVisa.disclaimer)}</small></div>`)}
  </main><footer>GentleCarE · Rapport préparé par MAVIK/Jarvis · Validation humaine obligatoire avant remise ou diffusion · Empreinte ${escapeHtml(report.contentHash.slice(0, 16))}</footer></article></body></html>`;
}

function persist(store, built, actor = {}) {
  ensureDir();
  const { report, intervention, quote, vehicle, client } = built;
  const base = `${slug(report.reportNumber)}-v${report.version}-${slug(client.name)}-${slug(vehicle.registration || vehicle.brand || 'vehicule')}`;
  const jsonFileName = `${base}.json`;
  const htmlFileName = `${base}.html`;
  const jsonUrl = `/generated/reports/${encodeURIComponent(jsonFileName)}`;
  const htmlUrl = `/generated/reports/${encodeURIComponent(htmlFileName)}`;
  fs.writeFileSync(path.join(REPORT_DIR, jsonFileName), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, htmlFileName), renderHtml(report), 'utf8');
  const document = store.create('documents', {
    title: `Rapport de référence ${report.reportNumber} — v${report.version}.0`, category: 'Rapport intervention', status: report.status,
    clientId: client.id || quote.clientId || '', vehicleId: vehicle.id || quote.vehicleId || '', interventionId: intervention.id, quoteId: quote.id || '',
    url: htmlUrl, htmlUrl, jsonUrl, reportNumber: report.reportNumber, reportVersion: report.version, reportSchemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: report.generatedAt, generatedBy: report.generatedBy, contentHash: report.contentHash, completeness: report.completeness,
    expertReviewRecommended: report.complementaryVisa.recommended, expertReviewStatus: report.complementaryVisa.status,
    createdBy: actor.id || '', createdByName: actor.name || actor.username || ''
  });
  store.update('interventions', intervention.id, {
    reportId: document.id, reportUrl: htmlUrl, reportJsonUrl: jsonUrl, reportVersion: report.version, reportStatus: report.status,
    reportContentHash: report.contentHash, reportCompleteness: report.completeness, reportGeneratedAt: report.generatedAt,
    expertReviewRecommended: report.complementaryVisa.recommended, expertReviewReason: report.complementaryVisa.reason,
    expertReviewStatus: report.complementaryVisa.status
  });
  if (quote.id) store.update('quotes', quote.id, { reportId: document.id, reportUrl: htmlUrl, reportVersion: report.version });
  return { report, document, htmlUrl, jsonUrl };
}

function generate(store, interventionReference, patch = {}, actor = {}) { return persist(store, build(store, interventionReference, patch, actor), actor); }
function validate(store, interventionReference, input = {}, actor = {}) {
  const intervention = typeof interventionReference === 'object' ? interventionReference : findRecord(store, 'interventions', interventionReference);
  if (!intervention) throw Object.assign(new Error('INTERVENTION_NOT_FOUND'), { status: 404 });
  if (!text(input.managerValidation || actor.name)) throw Object.assign(new Error('REPORT_MANAGER_VALIDATION_REQUIRED'), { status: 400 });
  return generate(store, intervention, {
    ...input,
    status: input.approved === false ? 'Corrections demandées' : 'Validé en interne — prêt à remettre',
    managerValidation: input.managerValidation || actor.name,
    validatedAt: iso()
  }, actor);
}

module.exports = { REPORT_DIR, REPORT_SCHEMA_VERSION, build, renderHtml, generate, validate, completeness };
