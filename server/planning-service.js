'use strict';

const base = require('./planning');
const originalPropose = base.propose.bind(base);
const originalScheduleQuote = base.scheduleQuote.bind(base);
const originalOverview = base.overview.bind(base);

function safeList(store, collection) {
  try { return store.list(collection) || []; }
  catch { return []; }
}
function calendarBlocks(store) {
  return safeList(store, 'externalCalendarEvents')
    .filter((event) => event.blocksWorkshop === true && !/supprim|annul|cancel/i.test(String(event.status || '')))
    .map((event) => ({
      id: `calendar-${event.id}`,
      title: event.title || 'Agenda externe',
      type: 'Agenda Google',
      startDate: event.startDate,
      endDate: event.endDate || event.startDate,
      startTime: '08:30',
      endTime: '17:00',
      status: 'Active',
      blocksWorkshop: true,
      notes: event.description || ''
    }));
}
function planningStore(store) {
  return {
    ...store,
    list(collection) {
      const records = safeList(store, collection);
      if (collection === 'quotes') return records.filter((quote) => !quote.interventionId);
      if (collection === 'planningBlocks') return [...records, ...calendarBlocks(store)];
      return records;
    }
  };
}
function propose(store, input = {}) { return originalPropose(planningStore(store), input); }
function scheduleQuote(store, input = {}, user = {}) {
  const quoteRecords = safeList(store, 'quotes');
  const proxy = {
    ...planningStore(store),
    list(collection) {
      if (collection === 'quotes') return quoteRecords.filter((quote) => !quote.interventionId || quote.id === input.quoteId || quote.number === input.quoteId);
      if (collection === 'planningBlocks') return [...safeList(store, 'planningBlocks'), ...calendarBlocks(store)];
      return safeList(store, collection);
    },
    update: store.update.bind(store),
    create: store.create.bind(store)
  };
  return originalScheduleQuote(proxy, input, user);
}
function dateInRange(date, start, end) { return date && date >= start && date <= end; }
function eventTouchesDates(event, dates) {
  const start = event.date;
  const end = event.endDate || start;
  return dates.some((date) => date >= start && date <= end);
}
function overview(store, input = {}) {
  const requestedDays = Math.max(5, Math.min(120, Number(input.days || 30)));
  const startInput = base.isoDate(input.from || new Date());
  const first = new Date(`${startInput}T12:00:00`);
  if ([0, 6].includes(first.getDay())) {
    do { first.setDate(first.getDate() + 1); } while ([0, 6].includes(first.getDay()));
  }
  const workshopDates = base.workdayRange(first, requestedDays);
  const from = workshopDates[0];
  const until = workshopDates[workshopDates.length - 1];
  const calendarSpan = Math.ceil(requestedDays * 7 / 5) + 4;
  const result = originalOverview(store, { ...input, from, days: calendarSpan });
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
    .map((quote) => ({ id: quote.id, number: quote.number, service: quote.service, client: clientName(quote.clientId), vehicle: vehicleLabel(quote.vehicleId), durationDays: Number(quote.estimatedDurationDays || 2), expertRequired: Boolean(quote.expertReviewRequired), expertReviewStatus: quote.expertReviewStatus || '', proposedStartDate: quote.estimatedStartDate || '', proposedEndDate: quote.estimatedEndDate || '', planningStatus: quote.planningStatus || '' }));
  const linkedQuoteIds = new Set(safeList(store, 'quotes').filter((quote) => quote.interventionId).map((quote) => quote.id));
  const leaveBlockRequestIds = new Set(safeList(store, 'planningBlocks').filter((block) => block.leaveRequestId).map((block) => block.leaveRequestId));
  result.events = result.events.filter((event) => {
    if (event.id?.startsWith('quote-') && linkedQuoteIds.has(event.quoteId)) return false;
    if (event.id?.startsWith('leave-') && leaveBlockRequestIds.has(event.leaveRequestId)) return false;
    return eventTouchesDates(event, workshopDates);
  });
  for (const event of safeList(store, 'externalCalendarEvents')) {
    if (/supprim|annul|cancel/i.test(String(event.status || ''))) continue;
    const date = String(event.startDate || '').slice(0, 10);
    const endDate = String(event.endDate || date).slice(0, 10);
    if (!workshopDates.some((day) => day >= date && day <= endDate)) continue;
    result.events.push({ id: `google-${event.id}`, date, endDate, time: '', endTime: '', type: 'Agenda Google', status: event.blocksWorkshop ? 'Bloque l’atelier' : 'Information', title: event.title || 'Événement agenda', notes: event.description || '', location: event.location || '', externalCalendarEventId: event.id });
  }
  result.events.sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  result.from = from;
  result.until = until;
  result.days = requestedDays;
  result.workshopDates = workshopDates;
  result.weekendsHidden = true;
  result.policy = { ...(result.policy || {}), saturdayClosed: true, sundayClosed: true, employeeEarlyStartAllowed: true, employeeDelayAllowed: false };
  return result;
}

base.propose = propose;
base.scheduleQuote = scheduleQuote;
base.overview = overview;

module.exports = base;
