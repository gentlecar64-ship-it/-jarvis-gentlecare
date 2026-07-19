'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(__dirname, 'data', 'tariffs.json');
const DEFAULTS = [
  {
    id: 'auto-particulier-integral', key: 'auto-particulier-integral', active: true,
    vehicleType: 'automobile', customerType: 'particulier',
    label: 'Automobile particulier — Pack Intégral Cryo + Dinitrol',
    pricingMode: 'fixed-ttc', totalTtc: 1500, durationDays: 2,
    tariffSource: 'Tarif particulier GentleCarE', directCostEstimateTtc: 0, targetMarginPercent: 0,
    aliases: ['automobile particulier', 'pack integral', 'cryo dinitrol']
  },
  {
    id: 'auto-professionnel-etude', key: 'auto-professionnel-etude', active: true,
    vehicleType: 'automobile', customerType: 'professionnel',
    label: 'Automobile professionnel — Intervention sur étude',
    pricingMode: 'hourly-ht', totalTtc: 0, hourlyRateHt: 180, travelRateHt: 85, durationDays: 2,
    tariffSource: 'Tarif professionnel — montant final à valider par la direction', directCostEstimateTtc: 0, targetMarginPercent: 0,
    aliases: ['automobile pro', 'professionnel', 'tarif pro']
  },
  {
    id: 'moto-particulier', key: 'moto-particulier', active: true,
    vehicleType: 'moto', customerType: 'particulier',
    label: 'Moto particulier — Tarif à configurer',
    pricingMode: 'direction-price', totalTtc: 0, durationDays: 1,
    tariffSource: 'Tarif moto particulier à valider par la direction', directCostEstimateTtc: 0, targetMarginPercent: 0,
    aliases: ['moto particulier', 'deux roues particulier']
  },
  {
    id: 'moto-professionnel', key: 'moto-professionnel', active: true,
    vehicleType: 'moto', customerType: 'professionnel',
    label: 'Moto professionnel — Tarif à configurer',
    pricingMode: 'direction-price', totalTtc: 0, durationDays: 1,
    tariffSource: 'Tarif moto professionnel à valider par la direction', directCostEstimateTtc: 0, targetMarginPercent: 0,
    aliases: ['moto pro', 'moto professionnel', 'deux roues pro']
  }
];

function ensure() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(DEFAULTS, null, 2), 'utf8');
}
function read() {
  ensure();
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [...DEFAULTS];
  } catch { return [...DEFAULTS]; }
}
function write(records) {
  ensure();
  const temp = `${FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(temp, FILE);
}
function cleanRecord(input = {}, current = {}) {
  const vehicleType = String(input.vehicleType ?? current.vehicleType ?? 'automobile').toLowerCase() === 'moto' ? 'moto' : 'automobile';
  const customerType = String(input.customerType ?? current.customerType ?? 'particulier').toLowerCase() === 'professionnel' ? 'professionnel' : 'particulier';
  return {
    ...current,
    ...input,
    id: String(current.id || input.id || crypto.randomUUID()),
    key: String(input.key ?? current.key ?? '').trim() || `tarif-${crypto.randomUUID()}`,
    active: input.active === undefined ? current.active !== false : input.active === true,
    vehicleType,
    customerType,
    label: String(input.label ?? current.label ?? '').trim(),
    pricingMode: ['fixed-ttc', 'hourly-ht', 'direction-price'].includes(input.pricingMode) ? input.pricingMode : (current.pricingMode || 'direction-price'),
    totalTtc: Math.max(0, Number(input.totalTtc ?? current.totalTtc ?? 0) || 0),
    hourlyRateHt: Math.max(0, Number(input.hourlyRateHt ?? current.hourlyRateHt ?? 0) || 0),
    travelRateHt: Math.max(0, Number(input.travelRateHt ?? current.travelRateHt ?? 0) || 0),
    durationDays: Math.max(1, Number(input.durationDays ?? current.durationDays ?? 1) || 1),
    tariffSource: String(input.tariffSource ?? current.tariffSource ?? '').trim(),
    directCostEstimateTtc: Math.max(0, Number(input.directCostEstimateTtc ?? current.directCostEstimateTtc ?? 0) || 0),
    targetMarginPercent: Math.max(0, Math.min(100, Number(input.targetMarginPercent ?? current.targetMarginPercent ?? 0) || 0)),
    aliases: Array.isArray(input.aliases) ? input.aliases.map((value) => String(value).trim()).filter(Boolean) : (current.aliases || [])
  };
}
function list(options = {}) {
  return read().filter((record) => options.includeInactive === true || record.active !== false);
}
function get(key) { return read().find((record) => record.key === key || record.id === key) || null; }
function save(input = {}, user = {}) {
  if (!['admin', 'associate'].includes(user.role)) throw Object.assign(new Error('TARIFF_DIRECTION_REQUIRED'), { status: 403 });
  const records = read();
  const index = records.findIndex((record) => record.id === input.id || record.key === input.key);
  const current = index >= 0 ? records[index] : {};
  const next = cleanRecord({ ...input, updatedAt: new Date().toISOString(), updatedBy: user.name || user.id || '' }, current);
  if (!next.label) throw Object.assign(new Error('TARIFF_LABEL_REQUIRED'), { status: 400 });
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
