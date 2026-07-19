'use strict';

const runtime = require('./feature-runtime-028');

function number(value) {
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function baseAmount(input = {}) {
  let tariff = null;
  try { tariff = require('./tariff-catalog').get(input.tariffKey || input.packageKey); } catch {}
  return number(input.serviceBaseTtc || input.finalPrice || input.customPrice || input.targetPrice || tariff?.totalTtc);
}
function withBaseAmount(input, callback) {
  const previous = global.serviceBaseTtc;
  global.serviceBaseTtc = baseAmount(input);
  try { return callback(); }
  finally {
    if (previous === undefined) delete global.serviceBaseTtc;
    else global.serviceBaseTtc = previous;
  }
}

if (!runtime.__mavikBaseAmountFixed) {
  const originalPrepared = runtime.preparedQuoteInput.bind(runtime);
  runtime.preparedQuoteInput = function preparedQuoteInputFixed(input = {}) {
    return withBaseAmount(input, () => originalPrepared(input));
  };
  runtime.__mavikBaseAmountFixed = true;
}

setImmediate(() => {
  try {
    const quoteStudio = require('./quote-studio-service');
    if (quoteStudio.__mavikBaseAmountFixed) return;
    const preview = quoteStudio.preview.bind(quoteStudio);
    const confirm = quoteStudio.confirm.bind(quoteStudio);
    quoteStudio.preview = function previewWithBaseAmount(store, input = {}, user = {}) {
      return withBaseAmount(input, () => preview(store, input, user));
    };
    quoteStudio.confirm = function confirmWithBaseAmount(store, input = {}, user = {}) {
      return withBaseAmount(input, () => confirm(store, input, user));
    };
    quoteStudio.__mavikBaseAmountFixed = true;
  } catch (error) {
    console.error('[MAVIK 0.28 base amount fix]', error);
  }
});

module.exports = runtime;
