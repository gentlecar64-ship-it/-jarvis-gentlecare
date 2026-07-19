'use strict';

const { knowledge } = require('./jarvis-knowledge');
knowledge.pricing.integralPublicTtc = knowledge.pricing.automobileParticulierIntegralTtc;
const base = require('./quote-workflow');

function removeObsoleteTariffLanguage(value) {
  return String(value || '')
    .replace(/pass\s+fondateur/gi, 'Pack Intégral Cryo Dinitrol')
    .replace(/tarif\s+club/gi, 'Pack Intégral Cryo Dinitrol')
    .replace(/membre\s+du\s+club/gi, 'client particulier')
    .replace(/\bfondatrice?\b/gi, 'client particulier');
}
function normalizeInput(input = {}) {
  const text = removeObsoleteTariffLanguage(input.text || input.command || '');
  return {
    ...input,
    text,
    command: removeObsoleteTariffLanguage(input.command || text),
    obsoleteTariffIgnored: /pass\s+fondateur|tarif\s+club|membre\s+du\s+club/i.test(String(input.text || input.command || ''))
  };
}
function parseIntake(input = {}) { return base.parseIntake(normalizeInput(input)); }
function startIntake(store, input = {}) {
  const normalized = normalizeInput(input);
  const result = base.startIntake(store, normalized);
  if (result?.data?.quote?.id && normalized.obsoleteTariffIgnored) {
    const quote = store.update('quotes', result.data.quote.id, {
      tariffSource: 'Tarif particulier en vigueur — ancienne appellation ignorée',
      obsoleteTariffIgnored: true,
      obsoleteTariffIgnoredAt: new Date().toISOString(),
      obsoleteTariffIgnoredBy: input.user?.name || input.user?.id || ''
    });
    result.data.quote = quote;
  }
  return result;
}

module.exports = { ...base, parseIntake, startIntake, removeObsoleteTariffLanguage };
