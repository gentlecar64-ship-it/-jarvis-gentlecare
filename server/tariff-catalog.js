'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const procedures = require('./workshop-procedures');

const FILE = path.join(__dirname, 'data', 'tariffs.json');
const DEFAULTS = [
  { id:'voiture-particulier-integral', key:'voiture-particulier-integral', active:true, vehicleType:'voiture', customerType:'particulier', label:'Voiture particulier — Pack Intégral Cryo + Dinitrol', pricingMode:'fixed-ttc', totalTtc:1500, durationDays:2, tariffSource:'Tarif particulier GentleCarE', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['voiture particulier','automobile particulier','pack integral','cryo dinitrol'] },
  { id:'voiture-professionnel-etude', key:'voiture-professionnel-etude', active:true, vehicleType:'voiture', customerType:'professionnel', label:'Voiture professionnel — Intervention sur étude', pricingMode:'hourly-ht', totalTtc:0, hourlyRateHt:180, travelRateHt:85, durationDays:2, tariffSource:'Tarif professionnel — montant final à valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['voiture pro','automobile pro','professionnel','tarif pro'] },
  { id:'moto-particulier', key:'moto-particulier', active:true, vehicleType:'moto', customerType:'particulier', label:'Moto particulier — Tarif à configurer', pricingMode:'direction-price', totalTtc:0, durationDays:1, tariffSource:'Tarif moto particulier à valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['moto particulier','deux roues particulier'] },
  { id:'moto-professionnel', key:'moto-professionnel', active:true, vehicleType:'moto', customerType:'professionnel', label:'Moto professionnel — Tarif à configurer', pricingMode:'direction-price', totalTtc:0, durationDays:1, tariffSource:'Tarif moto professionnel à valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['moto pro','moto professionnel','deux roues pro'] },
  { id:'utilitaire-etude', key:'utilitaire-etude', active:true, vehicleType:'utilitaire', customerType:'tous', label:'Utilitaire — Devis sur étude', pricingMode:'direction-price', totalTtc:0, durationDays:2, tariffSource:'Utilitaire : gabarit, état et accès à valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['utilitaire','fourgon','fourgonnette'] },
  { id:'camion-etude', key:'camion-etude', active:true, vehicleType:'camion', customerType:'tous', label:'Camion / poids lourd — Devis sur étude', pricingMode:'direction-price', totalTtc:0, durationDays:3, tariffSource:'Poids lourd : moyens, site et procédure à valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['camion','poids lourd','tracteur routier'] },
  { id:'avion-etude', key:'avion-etude', active:true, vehicleType:'avion', customerType:'tous', label:'Avion — Étude spécialisée', pricingMode:'direction-price', totalTtc:0, durationDays:1, tariffSource:'Étude aéronautique et autorisations obligatoires avant chiffrage', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['avion','aéronef'] },
  { id:'helicoptere-etude', key:'helicoptere-etude', active:true, vehicleType:'helicoptere', customerType:'tous', label:'Hélicoptère — Étude spécialisée', pricingMode:'direction-price', totalTtc:0, durationDays:1, tariffSource:'Étude aéronautique et autorisations obligatoires avant chiffrage', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['hélicoptère','helicoptere','hélico'] },
  { id:'industriel-etude', key:'industriel-etude', active:true, vehicleType:'industriel', customerType:'tous', label:'Devis industriel — Étude technique', pricingMode:'hourly-ht', totalTtc:0, hourlyRateHt:180, travelRateHt:85, durationDays:1, tariffSource:'Devis industriel sur étude — prix et marge à valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['devis industriel','machine industrielle','industrie'] },
  { id:'autre-etude', key:'autre-etude', active:true, vehicleType:'autre', customerType:'tous', label:'Autre demande — Qualification et devis sur étude', pricingMode:'direction-price', totalTtc:0, durationDays:1, tariffSource:'Demande particulière à qualifier et faire valider par la direction', directCostEstimateTtc:0, targetMarginPercent:0, aliases:['autre','cas particulier'] }
];

function ensure() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(DEFAULTS, null, 2), 'utf8');
}
function migrate(records) {
  const obsolete = new Set(['auto-particulier-integral','auto-professionnel-etude']);
  const kept = (Array.isArray(records) ? records : []).filter((item) => !obsolete.has(item.key));
  for (const item of DEFAULTS) if (!kept.some((current) => current.key === item.key)) kept.push({ ...item });
  return kept;
}
function read() {
  ensure();
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const migrated = migrate(parsed);
    if (JSON.stringify(migrated) !== JSON.stringify(parsed)) write(migrated);
    return migrated;
  } catch { return [...DEFAULTS]; }
}
function write(records) {
  ensure();
  const temp = `${FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(temp, FILE);
}
function cleanRecord(input = {}, current = {}) {
  const vehicleType = procedures.normalizeType(input.vehicleType ?? current.vehicleType) || 'autre';
  const requestedCustomerType = String(input.customerType ?? current.customerType ?? 'particulier').toLowerCase();
  const customerType = ['particulier','professionnel','tous'].includes(requestedCustomerType) ? requestedCustomerType : 'particulier';
  return {
    ...current, ...input,
    id: String(current.id || input.id || crypto.randomUUID()),
    key: String(input.key ?? current.key ?? '').trim() || `tarif-${crypto.randomUUID()}`,
    active: input.active === undefined ? current.active !== false : input.active === true,
    vehicleType, customerType,
    label: String(input.label ?? current.label ?? '').trim(),
    pricingMode: ['fixed-ttc','hourly-ht','direction-price'].includes(input.pricingMode) ? input.pricingMode : (current.pricingMode || 'direction-price'),
    totalTtc: Math.max(0, Number(input.totalTtc ?? current.totalTtc ?? 0) || 0),
    hourlyRateHt: Math.max(0, Number(input.hourlyRateHt ?? current.hourlyRateHt ?? 0) || 0),
    travelRateHt: Math.max(0, Number(input.travelRateHt ?? current.travelRateHt ?? 0) || 0),
    durationDays: Math.max(1, Number(input.durationDays ?? current.durationDays ?? procedures.get(vehicleType)?.defaultDurationDays ?? 1) || 1),
    tariffSource: String(input.tariffSource ?? current.tariffSource ?? '').trim(),
    directCostEstimateTtc: Math.max(0, Number(input.directCostEstimateTtc ?? current.directCostEstimateTtc ?? 0) || 0),
    targetMarginPercent: Math.max(0, Math.min(100, Number(input.targetMarginPercent ?? current.targetMarginPercent ?? 0) || 0)),
    aliases: Array.isArray(input.aliases) ? input.aliases.map((value) => String(value).trim()).filter(Boolean) : (current.aliases || [])
  };
}
function list(options = {}) { return read().filter((record) => options.includeInactive === true || record.active !== false); }
function get(key) { return read().find((record) => record.key === key || record.id === key) || null; }
function save(input = {}, user = {}) {
  if (!['admin','associate'].includes(user.role)) throw Object.assign(new Error('TARIFF_DIRECTION_REQUIRED'), { status:403 });
  const records = read();
  const index = records.findIndex((record) => record.id === input.id || record.key === input.key);
  const next = cleanRecord({ ...input, updatedAt:new Date().toISOString(), updatedBy:user.name || user.id || '' }, index >= 0 ? records[index] : {});
  if (!next.label) throw Object.assign(new Error('TARIFF_LABEL_REQUIRED'), { status:400 });
  if (index >= 0) records[index] = next; else records.push(next);
  write(records);
  return next;
}
function margin(input = {}) {
  const standardPriceTtc = Math.max(0, Number(input.standardPriceTtc || 0));
  const finalPriceTtc = Math.max(0, Number(input.finalPriceTtc || 0));
  const directCostTtc = Math.max(0, Number(input.directCostTtc || 0));
  const targetMarginPercent = Math.max(0, Math.min(100, Number(input.targetMarginPercent || 0)));
  const discountAmountTtc = Math.max(0, standardPriceTtc - finalPriceTtc);
  const discountPercent = standardPriceTtc > 0 ? discountAmountTtc / standardPriceTtc * 100 : 0;
  const grossMarginTtc = finalPriceTtc - directCostTtc;
  const grossMarginPercent = finalPriceTtc > 0 ? grossMarginTtc / finalPriceTtc * 100 : 0;
  const warnings = [];
  if (!directCostTtc) warnings.push('Coût direct non renseigné : la marge ne peut pas être contrôlée de façon fiable.');
  if (directCostTtc && grossMarginTtc < 0) warnings.push('Le prix final est inférieur au coût direct estimé.');
  if (targetMarginPercent && grossMarginPercent < targetMarginPercent) warnings.push(`La marge estimée est inférieure à l’objectif de ${targetMarginPercent.toFixed(1)} %.`);
  return { standardPriceTtc, finalPriceTtc, directCostTtc, targetMarginPercent, discountAmountTtc, discountPercent, grossMarginTtc, grossMarginPercent, warnings };
}

module.exports = { FILE, DEFAULTS, list, get, save, margin };
