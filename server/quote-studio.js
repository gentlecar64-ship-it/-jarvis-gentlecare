'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const quoteWorkflow = require('./quote-workflow');
const planning = require('./planning');
const { knowledge } = require('./jarvis-knowledge');

const PUBLIC_DIR = path.join(__dirname, 'public');
const QUOTE_DIR = path.join(PUBLIC_DIR, 'generated', 'quotes');
const LOGO_DIR = path.join(__dirname, 'assets', 'logo');
const HIGH_VALUE_THRESHOLD = 50000;
const DEPOSIT_RATE = 50;

function clean(value) { return String(value || '').trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function digits(value) { return clean(value).replace(/\D/g, ''); }
function upperRegistration(value) { return clean(value).toUpperCase().replace(/\s+/g, '-'); }
function number(value) { const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function euro(value) { return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
function escapeXml(value) { return String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char])); }
function normalizeSearch(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function officialLogoBase64() { try { return fs.readdirSync(LOGO_DIR).filter((name) => /^\d+\.txt$/.test(name)).sort().map((name) => fs.readFileSync(path.join(LOGO_DIR, name), 'utf8').trim()).join(''); } catch { return ''; } }
function ensureQuoteDir() { fs.mkdirSync(QUOTE_DIR, { recursive: true }); }
function slug(value, fallback = 'A-COMPLETER') { const result = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''); return result || fallback; }

function packages() {
  return [
    {
      key: 'integral-public',
      label: 'Pack Intégral Cryo + Dinitrol',
      totalTtc: Number(knowledge.pricing.integralPublicTtc || 0),
      durationDays: 2,
      tariffSource: 'Tarif public',
      aliases: ['pack integral', 'cryo dinitrol', 'integral public']
    },
    {
      key: 'integral-club',
      label: 'Pack Intégral Cryo + Dinitrol — Tarif Club',
      totalTtc: Number(knowledge.pricing.integralClubTtc || 0),
      durationDays: 2,
      tariffSource: 'Tarif Club',
      aliases: ['club', 'tarif club', 'membre club']
    },
    {
      key: 'integral-founder',
      label: 'Pack Intégral Cryo + Dinitrol — Pass Fondateur',
      totalTtc: Number(knowledge.pricing.integralFounderTtc || 0),
      durationDays: 2,
      tariffSource: 'Pass Fondateur -30 %',
      aliases: ['fondateur', 'pass fondateur', '-30']
    }
  ].filter((item) => item.totalTtc > 0);
}

function packageByKey(key) { return packages().find((item) => item.key === key) || null; }

function inferPackage(targetPrice, context = '') {
  const target = number(targetPrice);
  if (!target) return { status: 'missing', confidence: 0, targetPrice: 0, candidates: [], message: 'Indiquez un tarif exact ou approximatif.' };
  const words = normalizeSearch(context);
  const candidates = packages().map((item) => {
    const absoluteDelta = Math.abs(item.totalTtc - target);
    const relativeDelta = target ? absoluteDelta / target : 1;
    const aliasHit = item.aliases.some((alias) => words.includes(normalizeSearch(alias)));
    const score = Math.max(0, 1 - relativeDelta) + (aliasHit ? 0.3 : 0);
    return { ...item, absoluteDelta, relativeDelta, aliasHit, score: Number(score.toFixed(4)) };
  }).sort((a, b) => b.score - a.score || a.absoluteDelta - b.absoluteDelta);
  const first = candidates[0];
  const second = candidates[1];
  if (!first) return { status: 'custom', confidence: 0, targetPrice: target, candidates: [], message: 'Aucun forfait configuré.' };
  if (first.absoluteDelta <= 1) return { status: 'exact', confidence: 1, targetPrice: target, selected: first, candidates: candidates.slice(0, 3), message: `Le tarif correspond exactement à ${first.label}.` };
  const ambiguous = second && Math.abs(first.absoluteDelta - second.absoluteDelta) <= Math.max(25, target * 0.03) && !first.aliasHit;
  if (ambiguous) return { status: 'ambiguous', confidence: 0.5, targetPrice: target, selected: null, candidates: candidates.slice(0, 2), message: 'Le tarif est proche de deux forfaits. Une confirmation humaine est nécessaire.' };
  const tooFar = first.absoluteDelta > Math.max(180, target * 0.18);
  if (tooFar) return { status: 'custom', confidence: Math.max(0.1, 1 - first.relativeDelta), targetPrice: target, selected: null, candidates: candidates.slice(0, 3), message: 'Aucun forfait n’est suffisamment proche. Utilisez un tarif personnalisé avec un motif.' };
  return { status: 'approximate', confidence: Number(Math.max(0.55, 1 - first.relativeDelta).toFixed(2)), targetPrice: target, selected: first, candidates: candidates.slice(0, 3), message: `Le tarif semble correspondre à ${first.label}.` };
}

function parseSpeech(input = {}) {
  const parsed = quoteWorkflow.parseIntake({ text: input.text || input.command || '' });
  const priceMatch = clean(input.text || input.command).match(/(?:prix|tarif|budget|environ|autour de|à|a)\s*(\d[\d .]*)\s*(?:€|euros?)/i);
  const clientValueMatch = clean(input.text || input.command).match(/(?:client.*(?:estime|pense|valeur)|vaut selon (?:lui|elle))\D{0,20}(\d[\d .]*)\s*(?:€|euros?)/i);
  return {
    ...parsed,
    targetPrice: priceMatch ? number(priceMatch[1]) : 0,
    clientEstimatedValue: clientValueMatch ? number(clientValueMatch[1]) : 0
  };
}

function matchClient(client, query) {
  const q = normalizeSearch(query);
  const phone = digits(query);
  const registration = upperRegistration(query);
  return (!q || [client.name, client.email, client.mobile, client.phone].some((value) => normalizeSearch(value).includes(q))) || (phone.length >= 6 && [client.mobile, client.phone].some((value) => digits(value).includes(phone))) || registration === client.registration;
}

function lookup(store, query = '') {
  const q = clean(query);
  if (!q) return { records: [], exactRegistration: null };
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const registration = upperRegistration(q);
  const exactVehicle = vehicles.find((vehicle) => upperRegistration(vehicle.registration) === registration && registration);
  const candidateIds = new Set();
  for (const client of clients) if (matchClient(client, q)) candidateIds.add(client.id);
  for (const vehicle of vehicles) {
    const haystack = normalizeSearch([vehicle.brand, vehicle.model, vehicle.registration, vehicle.vin, vehicle.color].join(' '));
    if (haystack.includes(normalizeSearch(q)) || (registration && upperRegistration(vehicle.registration) === registration)) candidateIds.add(vehicle.clientId);
  }
  const records = clients.filter((client) => candidateIds.has(client.id)).slice(0, 20).map((client) => ({
    client,
    vehicles: vehicles.filter((vehicle) => vehicle.clientId === client.id)
  }));
  return {
    records,
    exactRegistration: exactVehicle ? { vehicle: exactVehicle, client: clients.find((client) => client.id === exactVehicle.clientId) || null } : null
  };
}

function raritySignals(input = {}) {
  const combined = normalizeSearch([input.brand, input.model, input.trim, input.series, input.notes].join(' '));
  const signals = [];
  const explicitTerms = [
    'serie limitee', 'limited edition', 'collector', 'collection', 'homologation', 'prototype', 'one off',
    'gt3', 'gt2', 'rs', 'gto', 'shelby', 'boss 302', 'mach 1', 'hellcat', 'viper', 'alpine a110',
    'ferrari', 'lamborghini', 'mclaren', 'aston martin', 'bentley', 'rolls royce', 'bugatti'
  ];
  for (const term of explicitTerms) if (combined.includes(term)) signals.push(`Mention détectée : ${term}`);
  const year = Number(input.year || 0);
  if (year && year <= new Date().getFullYear() - 30) signals.push('Véhicule âgé de 30 ans ou plus — potentiel véhicule de collection');
  return [...new Set(signals)];
}

function valuation(input = {}) {
  const providerMode = clean(input.valuationProvider || process.env.GCOS_VALUATION_PROVIDER || 'manual').toLowerCase();
  const now = new Date().toISOString();
  const marketValueAverage = number(input.marketValueAverage);
  const currentConditionValue = number(input.currentConditionValue);
  const postTreatmentValue = number(input.postTreatmentValue);
  const clientEstimatedValue = number(input.clientEstimatedValue);
  const expertCurrentValue = number(input.expertCurrentValue);
  const expertPostTreatmentValue = number(input.expertPostTreatmentValue);
  const source = providerMode === 'test' ? 'Mode test MAVIK' : 'Saisie manuelle / dossier client';
  const effectiveCurrentValue = expertCurrentValue || currentConditionValue;
  const effectivePostTreatmentValue = expertPostTreatmentValue || postTreatmentValue;
  const knownValues = [marketValueAverage, effectiveCurrentValue, effectivePostTreatmentValue, clientEstimatedValue].filter((value) => value > 0);
  const rarity = raritySignals(input);
  const isHighValue = knownValues.some((value) => value > HIGH_VALUE_THRESHOLD);
  const isRareVehicle = rarity.length > 0 || input.isRareVehicle === true;
  const expertReviewRequired = isHighValue || isRareVehicle || input.expertReviewRequired === true;
  const records = [
    { key: 'market', label: 'Valeur moyenne du marché', value: marketValueAverage, source: clean(input.marketValueSource || source), confidence: clean(input.marketValueConfidence || (marketValueAverage ? 'À confirmer' : 'Non disponible')), timestamp: now },
    { key: 'current', label: expertCurrentValue ? 'Valeur actuelle selon expert' : 'Valeur estimée dans l’état actuel', value: effectiveCurrentValue, source: expertCurrentValue ? clean(input.expertName || 'Expert indépendant') : clean(input.currentValueSource || source), confidence: expertCurrentValue ? 'Expert' : clean(input.currentValueConfidence || (currentConditionValue ? 'Indicative' : 'Non disponible')), timestamp: now },
    { key: 'after', label: expertPostTreatmentValue ? 'Valeur après traitement selon expert' : 'Valeur estimée après traitement', value: effectivePostTreatmentValue, source: expertPostTreatmentValue ? clean(input.expertName || 'Expert indépendant') : clean(input.postTreatmentValueSource || source), confidence: expertPostTreatmentValue ? 'Expert' : clean(input.postTreatmentValueConfidence || (postTreatmentValue ? 'Indicative' : 'Non disponible')), timestamp: now },
    { key: 'client', label: 'Estimation personnelle du client', value: clientEstimatedValue, source: 'Déclaration du client', confidence: clientEstimatedValue ? 'Déclarative' : 'Facultative', timestamp: now }
  ];
  return {
    providerMode,
    providerConfigured: providerMode !== 'manual',
    marketValueAverage,
    currentConditionValue,
    postTreatmentValue,
    clientEstimatedValue,
    expertCurrentValue,
    expertPostTreatmentValue,
    effectiveCurrentValue,
    effectivePostTreatmentValue,
    records,
    isHighValue,
    isRareVehicle,
    raritySignals: rarity,
    expertReviewRequired,
    expertReviewStatus: clean(input.expertReviewStatus || (expertReviewRequired ? 'À décider par David / Bénédicte' : 'Non requise')),
    notice: providerMode === 'manual'
      ? 'Aucune cote automobile externe n’est configurée. Les valeurs affichées proviennent uniquement des saisies identifiées et restent indicatives.'
      : 'Valeurs issues du mode de test MAVIK — ne pas communiquer comme une cote réelle.'
  };
}

function resolvePackage(input = {}) {
  const selected = packageByKey(input.packageKey);
  if (selected) return { ...selected, inference: { status: 'selected', confidence: 1 } };
  if (number(input.customPrice || input.targetPrice)) {
    const inference = inferPackage(input.customPrice || input.targetPrice, `${input.service || ''} ${input.notes || ''}`);
    if (input.confirmedPackageKey) {
      const confirmed = packageByKey(input.confirmedPackageKey);
      if (confirmed) return { ...confirmed, totalTtc: number(input.finalPrice || input.customPrice || confirmed.totalTtc), tariffSource: clean(input.tariffReason || confirmed.tariffSource), inference };
    }
    if (inference.selected && input.acceptInferredPackage === true) return { ...inference.selected, totalTtc: number(input.finalPrice || input.customPrice || inference.selected.totalTtc), tariffSource: clean(input.tariffReason || inference.selected.tariffSource), inference };
    return { key: 'custom', label: clean(input.service || 'Prestation personnalisée'), totalTtc: number(input.finalPrice || input.customPrice || input.targetPrice), durationDays: Math.max(1, number(input.durationDays) || 2), tariffSource: clean(input.tariffReason || 'Tarif personnalisé à justifier'), inference };
  }
  return { key: 'custom', label: clean(input.service || ''), totalTtc: 0, durationDays: Math.max(1, number(input.durationDays) || 2), tariffSource: 'Tarif à valider', inference: { status: 'missing', confidence: 0 } };
}

function buildData(store, input = {}, user = {}) {
  const parsed = parseSpeech(input);
  const merged = { ...parsed, ...input };
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const existingClient = merged.clientId ? clients.find((item) => item.id === merged.clientId) : null;
  const existingVehicle = merged.vehicleId ? vehicles.find((item) => item.id === merged.vehicleId) : null;
  const registration = upperRegistration(merged.registration || existingVehicle?.registration);
  const registrationOwner = registration ? vehicles.find((item) => upperRegistration(item.registration) === registration) : null;
  const ownerConflict = registrationOwner && existingClient && registrationOwner.clientId !== existingClient.id;
  const client = {
    id: existingClient?.id || '',
    name: clean(merged.clientName || merged.name || existingClient?.name),
    email: lower(merged.email || existingClient?.email),
    mobile: clean(merged.mobile || merged.phone || existingClient?.mobile || existingClient?.phone),
    address: clean(merged.address || existingClient?.address),
    preferredChannel: clean(merged.preferredChannel || existingClient?.preferredChannel || 'E-mail')
  };
  const vehicle = {
    id: existingVehicle?.id || '',
    clientId: existingClient?.id || '',
    brand: clean(merged.brand || existingVehicle?.brand),
    model: clean(merged.model || existingVehicle?.model),
    trim: clean(merged.trim || merged.series || existingVehicle?.trim || existingVehicle?.series),
    registration,
    vin: clean(merged.vin || existingVehicle?.vin).toUpperCase(),
    color: clean(merged.color || existingVehicle?.color),
    year: clean(merged.year || existingVehicle?.year),
    mileage: number(merged.mileage || existingVehicle?.mileage),
    photoUrl: clean(merged.photoUrl || existingVehicle?.photoUrl),
    notes: clean(merged.vehicleNotes || merged.notes || existingVehicle?.notes)
  };
  const packageData = resolvePackage(merged);
  const valueData = valuation({ ...merged, ...vehicle });
  const schedule = planning.propose(store, {
    quoteId: merged.quoteId,
    durationDays: packageData.durationDays,
    earliestDate: merged.earliestDate,
    expertRequired: valueData.expertReviewRequired,
    expertApproved: valueData.expertReviewStatus === 'Approuvée'
  });
  const missingFields = [];
  if (!client.name) missingFields.push('nom du client');
  if (!client.email && !client.mobile) missingFields.push('e-mail ou portable');
  if (!vehicle.brand) missingFields.push('marque');
  if (!vehicle.model) missingFields.push('modèle');
  if (!packageData.label) missingFields.push('prestation');
  if (!packageData.totalTtc) missingFields.push('prix validé');
  if (!vehicle.photoUrl) missingFields.push('photo du véhicule');
  const warnings = [];
  if (ownerConflict) warnings.push(`L’immatriculation ${registration} appartient déjà à un véhicule rattaché à un autre client. Aucune réaffectation automatique n’est autorisée.`);
  if (valueData.isHighValue) warnings.push(`Alerte : une valeur supérieure à ${euro(HIGH_VALUE_THRESHOLD)} a été saisie.`);
  if (valueData.isRareVehicle) warnings.push(`Rareté potentielle à vérifier : ${valueData.raritySignals.join(' ; ') || 'signal manuel'}.`);
  if (valueData.expertReviewRequired) warnings.push('Une décision humaine et, si nécessaire, un avis d’expert sont requis avant de promettre une date au client.');
  const audit = {
    preparedAt: new Date().toISOString(),
    preparedBy: user.name || user.id || '',
    source: clean(merged.source || (clean(input.text) ? 'voix + formulaire manuel' : 'formulaire manuel')),
    originalPriceTarget: number(merged.targetPrice || merged.customPrice),
    packageInference: packageData.inference,
    finalPackageKey: packageData.key,
    finalPackageLabel: packageData.label,
    finalPrice: packageData.totalTtc,
    tariffReason: packageData.tariffSource
  };
  return { client, vehicle, package: packageData, valuation: valueData, schedule, missingFields, warnings, ownerConflict: Boolean(ownerConflict), registrationOwner, audit };
}

function quoteText(data, quoteNumber = 'DEVIS À CRÉER') {
  const { client, vehicle, package: packageData, valuation: valueData, schedule } = data;
  const lines = [
    `DEVIS GENTLECARE — ${quoteNumber}`,
    '',
    `Client : ${client.name || 'À compléter'}`,
    `Contact : ${client.email || client.mobile || 'À compléter'}`,
    '',
    `Véhicule : ${[vehicle.brand, vehicle.model, vehicle.trim].filter(Boolean).join(' ') || 'À compléter'}`,
    `Année : ${vehicle.year || 'À compléter'}`,
    `Couleur : ${vehicle.color || 'À compléter'}`,
    `Immatriculation : ${vehicle.registration || 'À compléter'}`,
    `VIN : ${vehicle.vin || 'Non communiqué'}`,
    `Kilométrage : ${vehicle.mileage ? `${vehicle.mileage.toLocaleString('fr-FR')} km` : 'À compléter'}`,
    '',
    `Prestation : ${packageData.label || 'À définir'}`,
    `Tarification : ${packageData.tariffSource}`,
    `Total TTC : ${packageData.totalTtc ? euro(packageData.totalTtc) : 'À valider'}`,
    `Acompte 50 % : ${packageData.totalTtc ? euro(packageData.totalTtc * DEPOSIT_RATE / 100) : 'À calculer'}`,
    '',
    'ÉVALUATIONS DU VÉHICULE — INFORMATIONS INDICATIVES'
  ];
  for (const record of valueData.records) lines.push(`${record.label} : ${record.value ? euro(record.value) : 'Non renseignée'} — source : ${record.source} — niveau : ${record.confidence}`);
  lines.push('', valueData.notice, '');
  if (schedule.blocked) lines.push('Planning : Date à déterminer — nous vous recontactons rapidement après expertise.');
  else {
    lines.push(`Inspection proposée : ${schedule.inspection?.date || 'À déterminer'} à ${schedule.inspection?.time || ''}`);
    lines.push(`Intervention proposée : ${schedule.intervention?.startDate || 'À déterminer'} au ${schedule.intervention?.endDate || 'À déterminer'}`);
    lines.push(`Livraison estimée : ${schedule.intervention?.deliveryDate || 'À déterminer'} à ${schedule.intervention?.deliveryTime || ''}`);
  }
  lines.push('', 'Ce devis et son planning restent soumis à la validation de David ou Bénédicte. Aucun envoi externe n’est automatique.');
  return lines.join('\n');
}

function preview(store, input = {}, user = {}) {
  const data = buildData(store, input, user);
  return {
    type: 'quote-studio-preview',
    data,
    quoteText: quoteText(data),
    canCreate: !data.ownerConflict && data.missingFields.filter((field) => field !== 'photo du véhicule').length === 0,
    requiresPriceConfirmation: true,
    priceQuestion: 'Le prix proposé est-il correct ?',
    expertActionAvailable: data.valuation.expertReviewRequired
  };
}

function visualFileName(quote, client, vehicle) {
  return `${new Date().toISOString().slice(0, 10)}_${slug(quote.number)}_${slug(client.name)}_${slug(`${vehicle.brand}-${vehicle.model}`)}_${slug(vehicle.registration)}_DEVIS-v${clean(quote.version || '1.0')}.svg`;
}

function generateVisual(store, quote) {
  ensureQuoteDir();
  const client = safeList(store, 'clients').find((item) => item.id === quote.clientId) || {};
  const vehicle = safeList(store, 'vehicles').find((item) => item.id === quote.vehicleId) || {};
  const logo = officialLogoBase64();
  const filename = visualFileName(quote, client, vehicle);
  const values = Array.isArray(quote.valuationRecords) ? quote.valuationRecords : [];
  const valueRows = values.map((record, index) => {
    const y = 1280 + index * 58;
    return `<text x="94" y="${y}" font-size="19" fill="#b8cdd5">${escapeXml(record.label)}</text><text x="870" y="${y}" font-size="21" fill="#fff" font-weight="800">${escapeXml(record.value ? euro(record.value) : 'Non renseignée')}</text><text x="1298" y="${y}" text-anchor="end" font-size="15" fill="#91a7b0">${escapeXml(record.confidence || '')}</text>`;
  }).join('');
  const photo = quote.vehiclePhotoUrl || vehicle.photoUrl || '';
  const photoSvg = photo
    ? `<defs><clipPath id="photo"><rect x="66" y="310" width="1268" height="390" rx="28"/></clipPath></defs><image href="${escapeXml(photo)}" x="66" y="310" width="1268" height="390" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>`
    : `<rect x="66" y="310" width="1268" height="390" rx="28" fill="#102732"/><text x="700" y="515" text-anchor="middle" font-size="30" fill="#91aab5">PHOTO DU VÉHICULE À AJOUTER</text>`;
  const planningText = quote.expertReviewRequired && quote.expertReviewStatus !== 'Approuvée'
    ? 'DATE À DÉTERMINER — LE CLIENT SERA RECONTACTÉ APRÈS EXPERTISE'
    : `${quote.estimatedStartDate || 'À confirmer'} → ${quote.estimatedEndDate || 'À confirmer'} · Livraison ${quote.estimatedDeliveryDate || 'à confirmer'}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1980" viewBox="0 0 1400 1980">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07141c"/><stop offset=".55" stop-color="#15323e"/><stop offset="1" stop-color="#11231b"/></linearGradient><linearGradient id="green" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#527d39"/><stop offset="1" stop-color="#8bb961"/></linearGradient></defs>
<rect width="1400" height="1980" fill="url(#bg)"/><rect x="46" y="42" width="1308" height="1896" rx="42" fill="#07171f" fill-opacity=".78" stroke="#dff4fb" stroke-opacity=".15"/>
${logo ? `<image href="data:image/png;base64,${logo}" x="72" y="62" width="420" height="200" preserveAspectRatio="xMidYMid meet"/>` : ''}
<text x="1320" y="102" text-anchor="end" font-size="22" fill="#9db2bb">DEVIS VISUEL GENTLECARE</text><text x="1320" y="148" text-anchor="end" font-size="35" fill="#fff" font-weight="900">${escapeXml(quote.number)}</text>
<rect x="1010" y="174" width="310" height="54" rx="27" fill="${quote.expertReviewRequired ? '#8b632d' : '#4c7335'}"/><text x="1165" y="208" text-anchor="middle" font-size="18" fill="#fff" font-weight="800">${escapeXml(quote.status)}</text>
${photoSvg}
<rect x="66" y="730" width="615" height="190" rx="24" fill="#10252e"/><text x="94" y="778" font-size="17" fill="#9bd9ef" font-weight="800">CLIENT</text><text x="94" y="825" font-size="31" fill="#fff" font-weight="900">${escapeXml(client.name || 'À compléter')}</text><text x="94" y="870" font-size="20" fill="#b7cad2">${escapeXml(client.email || client.mobile || 'Coordonnées à compléter')}</text>
<rect x="707" y="730" width="627" height="190" rx="24" fill="#10252e"/><text x="735" y="778" font-size="17" fill="#a9d47b" font-weight="800">VÉHICULE</text><text x="735" y="825" font-size="30" fill="#fff" font-weight="900">${escapeXml([vehicle.brand, vehicle.model, vehicle.trim].filter(Boolean).join(' ') || 'À compléter')}</text><text x="735" y="870" font-size="20" fill="#b7cad2">${escapeXml([vehicle.year, vehicle.color, vehicle.registration].filter(Boolean).join(' · ') || 'Identification à compléter')}</text>
<rect x="66" y="950" width="1268" height="245" rx="28" fill="#0d2029"/><text x="94" y="1002" font-size="17" fill="#9bd9ef" font-weight="800">PRESTATION ET TARIF VALIDÉS</text><text x="94" y="1060" font-size="31" fill="#fff" font-weight="900">${escapeXml(quote.service)}</text><text x="94" y="1112" font-size="19" fill="#9fb5be">${escapeXml(quote.tariffSource || '')}</text><rect x="930" y="1000" width="370" height="150" rx="24" fill="url(#green)"/><text x="1115" y="1042" text-anchor="middle" font-size="17" fill="#eef8e8">TOTAL TTC</text><text x="1115" y="1098" text-anchor="middle" font-size="46" fill="#fff" font-weight="900">${escapeXml(euro(quote.totalTtc))}</text><text x="1115" y="1132" text-anchor="middle" font-size="18" fill="#eef8e8">Acompte 50 % : ${escapeXml(euro(quote.depositTtc))}</text>
<rect x="66" y="1220" width="1268" height="292" rx="28" fill="#10252e"/><text x="94" y="1260" font-size="17" fill="#9bd9ef" font-weight="800">ESTIMATIONS DU VÉHICULE — INDICATIVES ET SOURCÉES</text>${valueRows}
<rect x="66" y="1540" width="1268" height="130" rx="24" fill="${quote.expertReviewRequired ? '#412f1f' : '#132c22'}" stroke="${quote.expertReviewRequired ? '#ffcf72' : '#91bc5b'}" stroke-opacity=".4"/><text x="94" y="1590" font-size="17" fill="${quote.expertReviewRequired ? '#ffcf72' : '#a9d47b'}" font-weight="800">PLANNING</text><text x="94" y="1635" font-size="21" fill="#fff" font-weight="800">${escapeXml(planningText)}</text>
<text x="72" y="1740" font-size="17" fill="#9bd9ef" font-weight="800">CONTRÔLE HUMAIN OBLIGATOIRE</text><text x="72" y="1782" font-size="19" fill="#d9e8ed">Prix, identité, véhicule, estimations, expertise et dates doivent être validés par David ou Bénédicte.</text><line x1="72" y1="1835" x2="1328" y2="1835" stroke="#dff4fb" stroke-opacity=".14"/><text x="72" y="1880" font-size="16" fill="#91a7b0">GentleCarE · ZA Lantegia, 64990 Villefranque · Document préparé par MAVIK/Jarvis</text><text x="72" y="1915" font-size="15" fill="#78909a">Aucun envoi externe automatique. Les valeurs ne constituent pas une expertise automobile indépendante.</text>
</svg>`;
  fs.writeFileSync(path.join(QUOTE_DIR, filename), svg, 'utf8');
  return { filename, url: `/generated/quotes/${encodeURIComponent(filename)}` };
}

function updateExistingClient(store, current, data) {
  return store.update('clients', current.id, {
    name: data.name || current.name,
    email: data.email || current.email,
    mobile: data.mobile || current.mobile || current.phone,
    address: data.address || current.address,
    preferredChannel: data.preferredChannel || current.preferredChannel,
    smsAllowed: current.smsAllowed,
    emailAllowed: current.emailAllowed
  });
}

function updateExistingVehicle(store, current, data) {
  return store.update('vehicles', current.id, {
    clientId: current.clientId,
    brand: data.brand || current.brand,
    model: data.model || current.model,
    trim: data.trim || current.trim,
    registration: data.registration || current.registration,
    vin: data.vin || current.vin,
    color: data.color || current.color,
    year: data.year || current.year,
    mileage: data.mileage || current.mileage,
    photoUrl: data.photoUrl || current.photoUrl,
    notes: data.notes || current.notes
  });
}

function confirm(store, input = {}, user = {}) {
  if (input.humanConfirmed !== true) throw Object.assign(new Error('HUMAN_CONFIRMATION_REQUIRED'), { status: 409 });
  if (input.priceConfirmed !== true) throw Object.assign(new Error('PRICE_CONFIRMATION_REQUIRED'), { status: 409 });
  const data = buildData(store, input, user);
  if (data.ownerConflict) throw Object.assign(new Error('REGISTRATION_ALREADY_ATTACHED_TO_ANOTHER_CLIENT'), { status: 409 });
  const blockingMissing = data.missingFields.filter((field) => field !== 'photo du véhicule');
  if (blockingMissing.length) {
    const error = Object.assign(new Error('QUOTE_REQUIRED_FIELDS_MISSING'), { status: 400 });
    error.missingFields = blockingMissing;
    throw error;
  }
  let client = data.client.id ? safeList(store, 'clients').find((item) => item.id === data.client.id) : null;
  if (client) client = updateExistingClient(store, client, data.client);
  else client = store.create('clients', { ...data.client, smsAllowed: input.smsAllowed === true, emailAllowed: input.emailAllowed === true });
  let vehicle = data.vehicle.id ? safeList(store, 'vehicles').find((item) => item.id === data.vehicle.id) : null;
  if (vehicle && vehicle.clientId !== client.id) throw Object.assign(new Error('VEHICLE_CLIENT_MISMATCH'), { status: 409 });
  if (vehicle) vehicle = updateExistingVehicle(store, vehicle, { ...data.vehicle, clientId: client.id });
  else vehicle = store.create('vehicles', { ...data.vehicle, clientId: client.id });
  const quoteStatus = data.valuation.expertReviewRequired ? 'Expertise à décider' : (data.missingFields.length ? 'À finaliser – informations manquantes' : 'À valider');
  const schedule = data.schedule;
  const quote = store.create('quotes', {
    clientId: client.id,
    vehicleId: vehicle.id,
    service: data.package.label,
    packageKey: data.package.key,
    totalTtc: data.package.totalTtc,
    depositRate: DEPOSIT_RATE,
    depositTtc: data.package.totalTtc * DEPOSIT_RATE / 100,
    balanceTtc: data.package.totalTtc * (100 - DEPOSIT_RATE) / 100,
    tariffSource: data.package.tariffSource,
    estimatedDurationDays: data.package.durationDays,
    status: quoteStatus,
    workflowStatus: data.valuation.expertReviewRequired ? 'Expertise requise avant planning' : 'Devis à valider',
    provisional: data.missingFields.length > 0 || data.valuation.expertReviewRequired,
    validationRequired: true,
    externalSendAllowed: false,
    priceConfirmed: true,
    priceConfirmedBy: user.name || user.id || '',
    priceConfirmedAt: new Date().toISOString(),
    valuationProvider: data.valuation.providerMode,
    valuationRecords: data.valuation.records,
    marketValueAverage: data.valuation.marketValueAverage,
    currentConditionValue: data.valuation.currentConditionValue,
    postTreatmentValue: data.valuation.postTreatmentValue,
    clientEstimatedValue: data.valuation.clientEstimatedValue,
    expertCurrentValue: data.valuation.expertCurrentValue,
    expertPostTreatmentValue: data.valuation.expertPostTreatmentValue,
    valuationNotice: data.valuation.notice,
    isHighValue: data.valuation.isHighValue,
    isRareVehicle: data.valuation.isRareVehicle,
    raritySignals: data.valuation.raritySignals,
    expertReviewRequired: data.valuation.expertReviewRequired,
    expertReviewStatus: data.valuation.expertReviewStatus,
    vehiclePhotoUrl: vehicle.photoUrl || '',
    inspectionDate: schedule.inspection?.date || '',
    inspectionTime: schedule.inspection?.time || '',
    proposedDropoffDate: schedule.intervention?.dropoffDate || '',
    proposedDropoffTime: schedule.intervention?.dropoffTime || '',
    estimatedStartDate: schedule.intervention?.startDate || '',
    estimatedStartTime: schedule.intervention?.startTime || '',
    estimatedEndDate: schedule.intervention?.endDate || '',
    estimatedDeliveryDate: schedule.intervention?.deliveryDate || '',
    estimatedDeliveryTime: schedule.intervention?.deliveryTime || '',
    planningStatus: schedule.blocked ? 'Bloqué avant expertise' : 'Proposition — à valider',
    missingFields: data.missingFields,
    auditTrail: [data.audit],
    version: '1.0',
    createdBy: user.id || '',
    createdByName: user.name || ''
  });
  const exactText = quoteText(data, quote.number);
  const visual = generateVisual(store, { ...quote, quoteText: exactText });
  const updatedQuote = store.update('quotes', quote.id, { quoteText: exactText, mailDraftText: exactText, visualFileName: visual.filename, visualUrl: visual.url });
  const textDocument = store.create('documents', { title: `Devis texte ${quote.number}`, category: 'Devis texte', status: 'Brouillon bloqué — à valider', clientId: client.id, vehicleId: vehicle.id, quoteId: quote.id, content: exactText, version: '1.0', createdBy: user.id || '', createdByName: user.name || '' });
  const visualDocument = store.create('documents', { title: `Devis visuel ${quote.number}`, category: 'Devis visuel', status: 'Brouillon bloqué — à valider', clientId: client.id, vehicleId: vehicle.id, quoteId: quote.id, url: visual.url, version: '1.0', createdBy: user.id || '', createdByName: user.name || '' });
  store.create('tasks', { title: `Valider le prix et le devis ${quote.number}`, status: 'À faire', priority: 'Haute', assignee: 'David / Bénédicte', quoteId: quote.id, clientId: client.id, vehicleId: vehicle.id, instructions: 'Contrôler le forfait, le tarif, les données du véhicule, les estimations, le texte exact et le visuel avant tout envoi.' });
  if (data.valuation.expertReviewRequired) store.create('tasks', { title: `Décider si un expert doit examiner ${vehicle.brand} ${vehicle.model} — ${quote.number}`, status: 'À faire', priority: 'Haute', assignee: 'David / Bénédicte', quoteId: quote.id, clientId: client.id, vehicleId: vehicle.id, instructions: `Valeur élevée ou rareté potentielle. Ne promettre aucune date au client avant décision. ${data.valuation.raritySignals.join(' ; ')}` });
  const mail = store.create('communications', {
    clientId: client.id,
    vehicleId: vehicle.id,
    quoteId: quote.id,
    channel: 'E-mail',
    status: 'Brouillon bloqué — validation humaine et insertion manuelle du visuel requises',
    subject: `Votre devis GentleCarE — ${vehicle.brand} ${vehicle.model}`,
    message: exactText,
    attachmentUrl: visual.url,
    instructions: 'Le texte doit rester identique au devis validé. Ouvrir le lien visuel puis l’insérer manuellement dans le brouillon avant envoi.'
  });
  return { type: 'quote-studio-created', quote: updatedQuote, client, vehicle, documents: [textDocument, visualDocument], communication: mail, visualUrl: visual.url, quoteText: exactText, warnings: data.warnings };
}

function resolveQuote(store, reference) { return safeList(store, 'quotes').find((quote) => quote.id === reference || quote.number === reference) || null; }

function repricePreview(store, reference, input = {}) {
  const quote = resolveQuote(store, reference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  return { quote, inference: inferPackage(input.targetPrice, `${input.context || ''} ${quote.service || ''}`), question: 'Le prix proposé est-il correct ?' };
}

function applyReprice(store, reference, input = {}, user = {}) {
  if (input.confirmed !== true) throw Object.assign(new Error('PRICE_CONFIRMATION_REQUIRED'), { status: 409 });
  const quote = resolveQuote(store, reference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const inference = inferPackage(input.targetPrice, `${input.context || ''} ${quote.service || ''}`);
  const selected = input.packageKey ? packageByKey(input.packageKey) : inference.selected;
  const totalTtc = number(input.finalPrice || input.targetPrice || selected?.totalTtc);
  if (!totalTtc) throw Object.assign(new Error('FINAL_PRICE_REQUIRED'), { status: 400 });
  const packageLabel = selected?.label || clean(input.service || quote.service || 'Prestation personnalisée');
  const auditEntry = {
    changedAt: new Date().toISOString(),
    changedBy: user.name || user.id || '',
    originalPackage: quote.service,
    originalPrice: quote.totalTtc,
    humanTargetUtterance: clean(input.humanTargetUtterance || input.context),
    humanTargetPrice: number(input.targetPrice),
    inferredPackage: inference.selected?.label || '',
    inferenceStatus: inference.status,
    inferenceConfidence: inference.confidence,
    finalConfirmedPackage: packageLabel,
    finalConfirmedPrice: totalTtc,
    reason: clean(input.reason || 'Correction humaine du tarif')
  };
  let updated = store.update('quotes', quote.id, {
    service: packageLabel,
    packageKey: selected?.key || 'custom',
    totalTtc,
    depositTtc: totalTtc * DEPOSIT_RATE / 100,
    balanceTtc: totalTtc * (100 - DEPOSIT_RATE) / 100,
    tariffSource: clean(input.reason || selected?.tariffSource || 'Tarif personnalisé validé'),
    priceConfirmed: true,
    priceConfirmedBy: user.name || user.id || '',
    priceConfirmedAt: new Date().toISOString(),
    auditTrail: [...(Array.isArray(quote.auditTrail) ? quote.auditTrail : []), auditEntry],
    version: String((Number.parseFloat(quote.version || '1.0') + 1).toFixed(1))
  });
  const data = buildData(store, {
    clientId: updated.clientId,
    vehicleId: updated.vehicleId,
    packageKey: updated.packageKey,
    customPrice: updated.totalTtc,
    finalPrice: updated.totalTtc,
    service: updated.service,
    tariffReason: updated.tariffSource,
    ...updated
  }, user);
  const textValue = quoteText(data, updated.number);
  const visual = generateVisual(store, { ...updated, quoteText: textValue });
  updated = store.update('quotes', updated.id, { quoteText: textValue, mailDraftText: textValue, visualFileName: visual.filename, visualUrl: visual.url });
  return { quote: updated, inference, visualUrl: visual.url, quoteText: textValue };
}

function contactExpert(store, reference, input = {}, user = {}) {
  const quote = resolveQuote(store, reference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const client = clients.find((item) => item.id === quote.clientId) || {};
  const vehicle = vehicles.find((item) => item.id === quote.vehicleId) || {};
  const expertName = clean(input.expertName || 'Expert automobile à sélectionner');
  const task = store.create('tasks', {
    title: `Contacter l’expert — ${quote.number} — ${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
    status: 'À faire',
    priority: 'Haute',
    assignee: clean(input.assignee || 'David'),
    dueDate: clean(input.dueDate),
    quoteId: quote.id,
    clientId: quote.clientId,
    vehicleId: quote.vehicleId,
    instructions: `Transmettre le dossier uniquement après contrôle. Expert envisagé : ${expertName}. Motif : ${clean(input.reason || 'valeur élevée, rareté potentielle ou besoin de sécuriser le constat')}.`
  });
  const draft = store.create('communications', {
    clientId: quote.clientId,
    vehicleId: quote.vehicleId,
    quoteId: quote.id,
    channel: 'E-mail',
    status: 'Brouillon interne — ne pas envoyer sans validation',
    subject: `Demande d’avis professionnel — ${vehicle.brand || ''} ${vehicle.model || ''} — ${quote.number}`,
    message: `Bonjour,\n\nGentleCarE souhaite solliciter votre avis concernant ${[vehicle.brand, vehicle.model, vehicle.year, vehicle.registration].filter(Boolean).join(' · ')}.\n\nMotif : ${clean(input.reason || 'valeur élevée ou rareté potentielle à confirmer avant planification')}.\n\nLe dossier technique, les photographies et les estimations seront transmis après validation interne.\n\nBien cordialement,\nGentleCarE`,
    recipientName: expertName,
    recipientEmail: clean(input.expertEmail)
  });
  const updated = store.update('quotes', quote.id, { expertReviewRequired: true, expertReviewStatus: 'Contact à préparer', expertContactTaskId: task.id, expertDraftId: draft.id, planningStatus: 'Bloqué avant expertise', estimatedStartDate: '', estimatedEndDate: '', estimatedDeliveryDate: '' });
  return { quote: updated, task, communication: draft, client, vehicle };
}

function approveExpert(store, reference, input = {}, user = {}) {
  const quote = resolveQuote(store, reference);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const expertCurrentValue = number(input.expertCurrentValue);
  const expertPostTreatmentValue = number(input.expertPostTreatmentValue);
  let records = Array.isArray(quote.valuationRecords) ? quote.valuationRecords.map((item) => ({ ...item })) : [];
  records = records.map((record) => {
    if (record.key === 'current' && expertCurrentValue) return { ...record, label: 'Valeur actuelle selon expert', value: expertCurrentValue, source: clean(input.expertName || 'Expert indépendant'), confidence: 'Expert', timestamp: new Date().toISOString() };
    if (record.key === 'after' && expertPostTreatmentValue) return { ...record, label: 'Valeur après traitement selon expert', value: expertPostTreatmentValue, source: clean(input.expertName || 'Expert indépendant'), confidence: 'Expert', timestamp: new Date().toISOString() };
    return record;
  });
  const proposal = planning.propose(store, { quoteId: quote.id, durationDays: quote.estimatedDurationDays || 2, expertRequired: true, expertApproved: true });
  const updated = store.update('quotes', quote.id, {
    expertReviewStatus: 'Approuvée',
    expertName: clean(input.expertName),
    expertReference: clean(input.expertReference),
    expertReviewedAt: new Date().toISOString(),
    expertReviewedBy: user.name || user.id || '',
    expertCurrentValue,
    expertPostTreatmentValue,
    valuationRecords: records,
    inspectionDate: proposal.inspection?.date || '',
    inspectionTime: proposal.inspection?.time || '',
    proposedDropoffDate: proposal.intervention?.dropoffDate || '',
    proposedDropoffTime: proposal.intervention?.dropoffTime || '',
    estimatedStartDate: proposal.intervention?.startDate || '',
    estimatedEndDate: proposal.intervention?.endDate || '',
    estimatedDeliveryDate: proposal.intervention?.deliveryDate || '',
    estimatedDeliveryTime: proposal.intervention?.deliveryTime || '',
    planningStatus: 'Proposition après expertise — à valider'
  });
  return { quote: updated, proposal };
}

function listQuotes(store) {
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  return safeList(store, 'quotes').map((quote) => {
    const client = clients.find((item) => item.id === quote.clientId) || {};
    const vehicle = vehicles.find((item) => item.id === quote.vehicleId) || {};
    return { ...quote, clientName: client.name || '', vehicleLabel: [vehicle.brand, vehicle.model, vehicle.registration].filter(Boolean).join(' · ') };
  });
}

module.exports = {
  HIGH_VALUE_THRESHOLD,
  DEPOSIT_RATE,
  packages,
  inferPackage,
  parseSpeech,
  lookup,
  valuation,
  preview,
  confirm,
  repricePreview,
  applyReprice,
  contactExpert,
  approveExpert,
  listQuotes,
  resolveQuote,
  quoteText,
  generateVisual
};
