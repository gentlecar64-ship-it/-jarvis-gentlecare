'use strict';

const base = require('./quote-studio');
const originalPreview = base.preview.bind(base);
const originalConfirm = base.confirm.bind(base);

function useful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return value !== 0;
  return true;
}

function present(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => useful(value)));
}

function enrichSpeech(input = {}) {
  const parsed = base.parseSpeech({ text: input.text || input.command || '' });
  return { ...present(parsed), ...present(input) };
}

function preserveConfirmedPrice(input = {}) {
  const selected = base.packages().find((item) => item.key === input.packageKey);
  const explicitPrice = Number(input.finalPrice || input.customPrice || 0);
  if (!selected || !explicitPrice || Math.abs(explicitPrice - Number(selected.totalTtc || 0)) < 0.01) return input;
  return {
    ...input,
    packageKey: '',
    confirmedPackageKey: selected.key,
    customPrice: explicitPrice,
    finalPrice: explicitPrice,
    tariffReason: input.tariffReason || selected.tariffSource,
    acceptInferredPackage: false
  };
}

function normalizedInput(input = {}) {
  return preserveConfirmedPrice(enrichSpeech(input));
}

function preview(store, input = {}, user = {}) {
  return originalPreview(store, normalizedInput(input), user);
}

function confirm(store, input = {}, user = {}) {
  return originalConfirm(store, normalizedInput(input), user);
}

base.preview = preview;
base.confirm = confirm;
base.normalizedInput = normalizedInput;

module.exports = base;
