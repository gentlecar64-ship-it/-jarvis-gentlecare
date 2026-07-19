'use strict';

const base = require('./quote-studio');
const tariffs = require('./tariff-catalog');
const procedures = require('./workshop-procedures');
const originalPreview = base.preview.bind(base);
const originalConfirm = base.confirm.bind(base);

function useful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return value !== 0;
  return true;
}
function present(input = {}) { return Object.fromEntries(Object.entries(input).filter(([, value]) => useful(value))); }
function normalizeText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function number(value) { const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function euro(value) { return Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function direction(user = {}) { return ['admin', 'associate'].includes(user.role); }
function enrichSpeech(input = {}) {
  const parsed = base.parseSpeech({ text: input.text || input.command || '' });
  const spoken = String(input.text || input.command || '');
  const vehicleType = /\b(moto|scooter|deux.?roues|motocycle)\b/i.test(spoken) ? 'moto' : input.vehicleType;
  const customerType = /\b(pro|professionnel|entreprise|societe|société)\b/i.test(spoken) ? 'professionnel' : input.customerType;
  return { ...present(parsed), ...present(input), ...(vehicleType ? { vehicleType } : {}), ...(customerType ? { customerType } : {}) };
}
function catalogPackages() {
  return tariffs.list().map((item) => ({
    ...item,
    totalTtc: Number(item.totalTtc || 0),
    requiresDirectionPrice: item.pricingMode !== 'fixed-ttc' || !Number(item.totalTtc || 0),
    displayPrice: item.pricingMode === 'fixed-ttc' && item.totalTtc ? euro(item.totalTtc) : item.pricingMode === 'hourly-ht' ? `${Number(item.hourlyRateHt || 0).toLocaleString('fr-FR')} € HT/h — total à valider` : 'Prix à fixer par la direction'
  }));
}
function inferPackage(targetPrice, context = '') {
  const target = number(targetPrice);
  const words = normalizeText(context);
  const records = catalogPackages().filter((item) => item.totalTtc > 0);
  if (!target) return { status: 'missing', confidence: 0, targetPrice: 0, candidates: records, message: 'Indiquez un tarif exact ou approximatif.' };
  const candidates = records.map((item) => {
    const absoluteDelta = Math.abs(item.totalTtc - target);
    const relativeDelta = target ? absoluteDelta / target : 1;
    const aliasHit = (item.aliases || []).some((alias) => words.includes(normalizeText(alias)));
    return { ...item, absoluteDelta, relativeDelta, aliasHit, score: Math.max(0, 1 - relativeDelta) + (aliasHit ? 0.3 : 0) };
  }).sort((a, b) => b.score - a.score || a.absoluteDelta - b.absoluteDelta);
  const first = candidates[0]; const second = candidates[1];
  if (!first) return { status: 'custom', confidence: 0, targetPrice: target, candidates: [], message: 'Aucun tarif fixe configuré. La direction doit fixer le prix.' };
  if (first.absoluteDelta <= 1) return { status: 'exact', confidence: 1, targetPrice: target, selected: first, candidates: candidates.slice(0, 3), message: `Le tarif correspond exactement à ${first.label}.` };
  if (second && Math.abs(first.absoluteDelta - second.absoluteDelta) <= Math.max(25, target * 0.03) && !first.aliasHit) return { status: 'ambiguous', confidence: 0.5, targetPrice: target, selected: null, candidates: candidates.slice(0, 2), message: 'Le tarif est proche de plusieurs offres. Une décision humaine est nécessaire.' };
  if (first.absoluteDelta > Math.max(180, target * 0.18)) return { status: 'custom', confidence: Math.max(0.1, 1 - first.relativeDelta), targetPrice: target, selected: null, candidates: candidates.slice(0, 3), message: 'Aucun tarif fixe n’est suffisamment proche. La direction doit valider un prix personnalisé.' };
  return { status: 'approximate', confidence: Number(Math.max(0.55, 1 - first.relativeDelta).toFixed(2)), targetPrice: target, selected: first, candidates: candidates.slice(0, 3), message: `Le tarif semble correspondre à ${first.label}.` };
}
function normalizedInput(input = {}) {
  const enriched = enrichSpeech(input);
  const vehicleType = procedures.normalizeType(enriched.vehicleType);
  const customerType = String(enriched.customerType || 'particulier').toLowerCase() === 'professionnel' ? 'professionnel' : 'particulier';
  const selected = tariffs.get(enriched.tariffKey || enriched.packageKey);
  const standardPrice = number(enriched.standardPriceTtc || selected?.totalTtc || enriched.targetPrice || enriched.finalPrice);
  let finalPrice = number(enriched.finalPrice || enriched.customPrice || selected?.totalTtc || enriched.targetPrice);
  let tariffReason = String(enriched.tariffReason || selected?.tariffSource || 'Tarif à valider').trim();
  let margin = null;
  if (enriched.specialOfferEnabled === true) {
    if (!finalPrice && standardPrice && number(enriched.discountPercent)) finalPrice = standardPrice * (100 - number(enriched.discountPercent)) / 100;
    if (!finalPrice && standardPrice && number(enriched.discountAmountTtc)) finalPrice = Math.max(0, standardPrice - number(enriched.discountAmountTtc));
    margin = tariffs.margin({ standardPriceTtc: standardPrice, finalPriceTtc: finalPrice, directCostTtc: enriched.directCostTtc || selected?.directCostEstimateTtc, targetMarginPercent: enriched.targetMarginPercent || selected?.targetMarginPercent });
    tariffReason = `Remise commerciale accordée par la direction${enriched.specialOfferName ? ` — ${enriched.specialOfferName}` : ''} : ${margin.discountPercent.toFixed(1)} % (${euro(margin.discountAmountTtc)})`;
  }
  const service = String(enriched.service || selected?.label || '').trim();
  return {
    ...enriched, vehicleType, customerType,
    tariffKey: selected?.key || String(enriched.tariffKey || enriched.packageKey || 'custom'),
    packageKey: '', confirmedPackageKey: '', acceptInferredPackage: false,
    service, customPrice: finalPrice, finalPrice, targetPrice: number(enriched.targetPrice || standardPrice || finalPrice),
    durationDays: Math.max(1, number(enriched.durationDays || selected?.durationDays || (vehicleType === 'moto' ? 1 : 2))), tariffReason,
    standardPriceTtc: standardPrice, specialOfferMargin: margin,
    workshopProcedureKey: procedures.get(vehicleType).key, workshopProcedure: procedures.snapshot(vehicleType), selectedTariff: selected || null
  };
}
function appendOperationalText(text, input) {
  const lines = [String(text || '').trim(), '', `Orientation atelier : ${input.vehicleType === 'moto' ? 'Moto / deux-roues' : 'Automobile'}`, `Procédure : ${input.workshopProcedure.label} — version ${input.workshopProcedure.version}`];
  if (input.specialOfferEnabled === true) {
    const margin = input.specialOfferMargin || tariffs.margin({ standardPriceTtc: input.standardPriceTtc, finalPriceTtc: input.finalPrice, directCostTtc: input.directCostTtc, targetMarginPercent: input.targetMarginPercent });
    lines.push('', 'OFFRE SPÉCIALE VALIDÉE PAR LA DIRECTION', `Bénéficiaire / opération : ${input.specialOfferName || 'À préciser'}`, `Tarif de référence : ${euro(margin.standardPriceTtc)}`, `Remise commerciale : ${margin.discountPercent.toFixed(1)} % — ${euro(margin.discountAmountTtc)}`, `Prix final TTC : ${euro(margin.finalPriceTtc)}`, `Marge brute estimée : ${input.directCostTtc ? `${euro(margin.grossMarginTtc)} — ${margin.grossMarginPercent.toFixed(1)} %` : 'À compléter — coût direct non renseigné'}`);
    if (margin.warnings.length) lines.push(`Alerte marge : ${margin.warnings.join(' ')}`);
  }
  return lines.join('\n');
}
function preview(store, input = {}, user = {}) {
  const normalized = normalizedInput(input);
  const result = originalPreview(store, normalized, user);
  const selected = normalized.selectedTariff;
  result.data.vehicle.vehicleType = normalized.vehicleType;
  result.data.vehicle.workshopProcedureKey = normalized.workshopProcedureKey;
  result.data.package.key = normalized.tariffKey;
  result.data.package.label = normalized.service || result.data.package.label;
  result.data.package.tariffSource = normalized.tariffReason;
  result.data.package.inference = inferPackage(normalized.targetPrice, `${normalized.service} ${normalized.vehicleType} ${normalized.customerType}`);
  result.data.workshopProcedure = normalized.workshopProcedure;
  result.data.specialOffer = normalized.specialOfferEnabled ? { enabled: true, name: normalized.specialOfferName, margin: normalized.specialOfferMargin } : { enabled: false };
  result.quoteText = appendOperationalText(result.quoteText, normalized);
  if (selected?.requiresDirectionPrice && !normalized.finalPrice) {
    result.canCreate = false;
    if (!result.data.missingFields.includes('prix validé par la direction')) result.data.missingFields.push('prix validé par la direction');
  }
  result.margin = normalized.specialOfferMargin;
  result.requiresDirectionApproval = normalized.specialOfferEnabled === true || selected?.requiresDirectionPrice === true;
  return result;
}
function confirm(store, input = {}, user = {}) {
  const normalized = normalizedInput(input);
  if (normalized.specialOfferEnabled === true && !direction(user)) throw Object.assign(new Error('SPECIAL_OFFER_DIRECTION_APPROVAL_REQUIRED'), { status: 403 });
  const selected = normalized.selectedTariff;
  if (selected?.requiresDirectionPrice && !normalized.finalPrice) throw Object.assign(new Error('DIRECTION_PRICE_REQUIRED'), { status: 409 });
  const result = originalConfirm(store, normalized, user);
  const exactText = appendOperationalText(result.quoteText, normalized);
  const margin = normalized.specialOfferMargin;
  const vehicle = store.update('vehicles', result.vehicle.id, { vehicleType: normalized.vehicleType, workshopProcedureKey: normalized.workshopProcedureKey });
  const quote = store.update('quotes', result.quote.id, {
    vehicleType: normalized.vehicleType, customerType: normalized.customerType, tariffKey: normalized.tariffKey,
    service: normalized.service || result.quote.service, tariffSource: normalized.tariffReason,
    workshopProcedureKey: normalized.workshopProcedureKey, workshopProcedure: normalized.workshopProcedure,
    specialOfferEnabled: normalized.specialOfferEnabled === true, specialOfferName: normalized.specialOfferName || '',
    standardPriceTtc: normalized.standardPriceTtc || result.quote.totalTtc,
    discountPercent: margin?.discountPercent || 0, discountAmountTtc: margin?.discountAmountTtc || 0,
    directCostTtc: margin?.directCostTtc || 0, grossMarginTtc: margin?.grossMarginTtc || 0, grossMarginPercent: margin?.grossMarginPercent || 0,
    specialOfferApprovedByDirection: normalized.specialOfferEnabled === true,
    specialOfferApprovedBy: normalized.specialOfferEnabled ? (user.name || user.id || '') : '', specialOfferApprovedAt: normalized.specialOfferEnabled ? new Date().toISOString() : '',
    quoteText: exactText, mailDraftText: exactText,
    auditTrail: [...(result.quote.auditTrail || []), { changedAt: new Date().toISOString(), changedBy: user.name || user.id || '', tariffKey: normalized.tariffKey, vehicleType: normalized.vehicleType, customerType: normalized.customerType, specialOffer: normalized.specialOfferEnabled === true, margin }]
  });
  for (const document of result.documents || []) if (document.category === 'Devis texte') store.update('documents', document.id, { content: exactText });
  if (result.communication?.id) store.update('communications', result.communication.id, { message: exactText });
  return { ...result, quote, vehicle, quoteText: exactText, margin, workshopProcedure: normalized.workshopProcedure };
}
function resolveQuote(store, id) { return safeList(store, 'quotes').find((item) => item.id === id || item.number === id) || null; }
function repricePreview(store, id, input = {}, user = {}) {
  const quote = resolveQuote(store, id);
  if (!quote) throw Object.assign(new Error('QUOTE_NOT_FOUND'), { status: 404 });
  const normalized = normalizedInput({ ...quote, ...input, vehicleType: input.vehicleType || quote.vehicleType, customerType: input.customerType || quote.customerType, tariffKey: input.tariffKey || input.packageKey || quote.tariffKey, standardPriceTtc: input.standardPriceTtc || quote.standardPriceTtc || quote.totalTtc });
  const margin = normalized.specialOfferEnabled ? normalized.specialOfferMargin : tariffs.margin({ standardPriceTtc: normalized.standardPriceTtc || quote.totalTtc, finalPriceTtc: normalized.finalPrice, directCostTtc: input.directCostTtc || quote.directCostTtc, targetMarginPercent: input.targetMarginPercent || quote.targetMarginPercent });
  return { quote, tariff: normalized.selectedTariff, finalPrice: normalized.finalPrice, tariffReason: normalized.tariffReason, specialOffer: normalized.specialOfferEnabled, margin, directionRequired: true };
}
function applyReprice(store, id, input = {}, user = {}) {
  if (!direction(user)) throw Object.assign(new Error('REPRICE_DIRECTION_REQUIRED'), { status: 403 });
  if (input.confirmed !== true) throw Object.assign(new Error('REPRICE_CONFIRMATION_REQUIRED'), { status: 409 });
  const previewResult = repricePreview(store, id, input, user);
  if (!previewResult.finalPrice) throw Object.assign(new Error('DIRECTION_PRICE_REQUIRED'), { status: 409 });
  const quote = previewResult.quote;
  const depositTtc = Math.round(previewResult.finalPrice * Number(base.DEPOSIT_RATE || 0.5) * 100) / 100;
  const updated = store.update('quotes', quote.id, {
    totalTtc: previewResult.finalPrice, depositTtc,
    tariffKey: previewResult.tariff?.key || input.tariffKey || 'custom',
    packageKey: previewResult.tariff?.key || input.tariffKey || 'custom',
    packageLabel: previewResult.tariff?.label || input.service || quote.service || 'Prestation personnalisée',
    tariffSource: previewResult.tariffReason,
    specialOfferEnabled: previewResult.specialOffer === true,
    specialOfferName: String(input.specialOfferName || quote.specialOfferName || ''),
    standardPriceTtc: previewResult.margin.standardPriceTtc,
    discountPercent: previewResult.margin.discountPercent,
    discountAmountTtc: previewResult.margin.discountAmountTtc,
    directCostTtc: previewResult.margin.directCostTtc,
    grossMarginTtc: previewResult.margin.grossMarginTtc,
    grossMarginPercent: previewResult.margin.grossMarginPercent,
    specialOfferApprovedByDirection: previewResult.specialOffer === true,
    specialOfferApprovedBy: previewResult.specialOffer ? (user.name || user.id || '') : '',
    specialOfferApprovedAt: previewResult.specialOffer ? new Date().toISOString() : '',
    priceConfirmedBy: user.name || user.id || '', priceConfirmedAt: new Date().toISOString(),
    auditTrail: [...(quote.auditTrail || []), { changedAt: new Date().toISOString(), changedBy: user.name || user.id || '', action: 'direction-reprice', previousPrice: quote.totalTtc, finalPrice: previewResult.finalPrice, tariffKey: previewResult.tariff?.key || input.tariffKey || 'custom', reason: previewResult.tariffReason, margin: previewResult.margin }]
  });
  return { quote: updated, inference: inferPackage(previewResult.finalPrice, previewResult.tariffReason), margin: previewResult.margin };
}

base.packages = catalogPackages;
base.packageByKey = tariffs.get;
base.inferPackage = inferPackage;
base.preview = preview;
base.confirm = confirm;
base.repricePreview = repricePreview;
base.applyReprice = applyReprice;
base.normalizedInput = normalizedInput;
base.tariffs = tariffs;
base.procedures = procedures;

module.exports = base;
