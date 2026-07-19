'use strict';

const base = require('./planning');
const originalPropose = base.propose.bind(base);
const originalScheduleQuote = base.scheduleQuote.bind(base);
const originalOverview = base.overview.bind(base);

function safeList(store, collection) {
  try { return store.list(collection) || []; }
  catch { return []; }
}

function planningStore(store) {
  return {
    ...store,
    list(collection) {
      const records = safeList(store, collection);
      if (collection !== 'quotes') return records;
      return records.filter((quote) => !quote.interventionId);
    }
  };
}

function propose(store, input = {}) {
  return originalPropose(planningStore(store), input);
}

function scheduleQuote(store, input = {}, user = {}) {
  const quoteRecords = safeList(store, 'quotes');
  const proxy = {
    ...planningStore(store),
    list(collection) {
      if (collection === 'quotes') return quoteRecords.filter((quote) => !quote.interventionId || quote.id === input.quoteId || quote.number === input.quoteId);
      return safeList(store, collection);
    },
    update: store.update.bind(store),
    create: store.create.bind(store)
  };
  return originalScheduleQuote(proxy, input, user);
}

function overview(store, input = {}) {
  const result = originalOverview(store, input);
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const clientName = (id) => clients.find((item) => item.id === id)?.name || '';
  const vehicleLabel = (id) => {
    const vehicle = vehicles.find((item) => item.id === id) || {};
    return [vehicle.brand, vehicle.model, vehicle.registration].filter(Boolean).join(' · ');
  };
  const active = (status) => !/annul|archiv|refus/i.test(String(status || ''));
  result.unscheduledQuotes = safeList(store, 'quotes')
    .filter((quote) => active(quote.status) && (!quote.estimatedStartDate || !/confirm/i.test(String(quote.planningStatus || ''))))
    .map((quote) => ({
      id: quote.id,
      number: quote.number,
      service: quote.service,
      client: clientName(quote.clientId),
      vehicle: vehicleLabel(quote.vehicleId),
      durationDays: Number(quote.estimatedDurationDays || 2),
      expertRequired: Boolean(quote.expertReviewRequired),
      expertReviewStatus: quote.expertReviewStatus || '',
      proposedStartDate: quote.estimatedStartDate || '',
      proposedEndDate: quote.estimatedEndDate || '',
      planningStatus: quote.planningStatus || ''
    }));
  const linkedQuoteIds = new Set(safeList(store, 'quotes').filter((quote) => quote.interventionId).map((quote) => quote.id));
  const leaveBlockRequestIds = new Set(safeList(store, 'planningBlocks').filter((block) => block.leaveRequestId).map((block) => block.leaveRequestId));
  result.events = result.events.filter((event) => {
    if (event.id?.startsWith('quote-') && linkedQuoteIds.has(event.quoteId)) return false;
    if (event.id?.startsWith('leave-') && leaveBlockRequestIds.has(event.leaveRequestId)) return false;
    return true;
  });
  return result;
}

base.propose = propose;
base.scheduleQuote = scheduleQuote;
base.overview = overview;

module.exports = base;
