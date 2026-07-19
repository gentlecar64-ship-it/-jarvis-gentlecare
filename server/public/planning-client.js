(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Erreur ${response.status}`);
      Object.assign(error, data);
      throw error;
    }
    return data;
  };

  const state = {
    from: new Date().toISOString().slice(0, 10),
    days: 42,
    overview: null,
    selectedQuote: null,
    proposal: null
  };

  function dateLabel(value, options = {}) {
    if (!value) return 'Date à définir';
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('fr-FR', { weekday: options.short ? 'short' : 'long', day: '2-digit', month: options.short ? 'short' : 'long', year: options.year ? 'numeric' : undefined }).format(date);
  }

  function addDays(value, amount) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function eachDate(from, days) {
    return Array.from({ length: days }, (_, index) => addDays(from, index));
  }

  function eventClass(type = '') {
    return String(type).toLowerCase().replace(/[^a-zà-ÿ]+/g, '-');
  }

  function eventsForDate(date) {
    return (state.overview?.events || []).filter((event) => {
      const start = event.date;
      const end = event.endDate || start;
      return date >= start && date <= end;
    });
  }

  function renderCalendar() {
    const today = new Date().toISOString().slice(0, 10);
    $('rangeLabel').textContent = `${dateLabel(state.overview.from, { year: true })} → ${dateLabel(state.overview.until, { year: true })}`;
    $('capacityMetric').textContent = state.overview.capacity || 1;
    $('eventsMetric').textContent = (state.overview.events || []).length;
    $('unscheduledMetric').textContent = (state.overview.unscheduledQuotes || []).length;
    $('blockedMetric').textContent = (state.overview.unscheduledQuotes || []).filter((quote) => quote.expertRequired && quote.expertReviewStatus !== 'Approuvée').length;
    const days = eachDate(state.overview.from, state.overview.days);
    $('calendar').innerHTML = days.map((date) => {
      const parsed = new Date(`${date}T12:00:00`);
      const weekend = [0, 6].includes(parsed.getDay());
      const events = eventsForDate(date);
      return `<section class="day ${date === today ? 'today' : ''} ${weekend ? 'weekend' : ''}"><div class="day-head"><strong>${esc(dateLabel(date, { short: true }))}</strong><span>${esc(date)}</span></div><div class="events">${events.map((event) => `<article class="event ${esc(eventClass(event.type))}" title="${esc(event.status || '')}"><b>${esc(event.time ? `${event.time} · ${event.title}` : event.title)}</b><small>${esc([event.type, event.client, event.vehicle, event.assignee].filter(Boolean).join(' · '))}</small></article>`).join('') || '<span class="muted">Libre</span>'}</div></section>`;
    }).join('');
    renderUnscheduled();
    renderQuoteSelect();
  }

  function renderUnscheduled() {
    const records = state.overview.unscheduledQuotes || [];
    $('unscheduledQuotes').innerHTML = records.map((quote) => {
      const blocked = quote.expertRequired && quote.expertReviewStatus !== 'Approuvée';
      return `<article class="card"><strong>${esc(quote.number)} — ${esc(quote.client || 'Client')}</strong><span class="muted">${esc(quote.vehicle || '')} · ${esc(quote.service || '')}</span>${blocked ? '<div class="alert">Date à déterminer — expertise ou décision humaine requise.</div>' : ''}<div class="actions"><button type="button" data-plan-quote="${esc(quote.id)}" ${blocked ? 'disabled' : ''}>Planifier</button><a class="button" href="/quotes">Ouvrir les devis</a></div></article>`;
    }).join('') || '<div class="muted">Tous les devis actifs possèdent déjà une proposition de planning.</div>';
    $('unscheduledQuotes').querySelectorAll('[data-plan-quote]').forEach((button) => button.onclick = () => {
      $('scheduleQuote').value = button.dataset.planQuote;
      selectQuote();
      propose();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  function renderQuoteSelect() {
    const all = state.overview.unscheduledQuotes || [];
    const current = $('scheduleQuote').value;
    $('scheduleQuote').innerHTML = '<option value="">Choisir un devis</option>' + all.map((quote) => `<option value="${esc(quote.id)}">${esc(quote.number)} — ${esc(quote.client || '')} — ${esc(quote.vehicle || '')}</option>`).join('');
    if (all.some((quote) => quote.id === current)) $('scheduleQuote').value = current;
    const queryQuote = new URLSearchParams(location.search).get('quote');
    if (queryQuote && all.some((quote) => quote.id === queryQuote)) {
      $('scheduleQuote').value = queryQuote;
      selectQuote();
    }
  }

  function selectQuote() {
    const id = $('scheduleQuote').value;
    state.selectedQuote = (state.overview.unscheduledQuotes || []).find((quote) => quote.id === id) || null;
    state.proposal = null;
    if (!state.selectedQuote) {
      $('proposalStatus').textContent = 'Sélectionnez un devis.';
      return;
    }
    if (state.selectedQuote.expertRequired && state.selectedQuote.expertReviewStatus !== 'Approuvée') {
      $('proposalStatus').innerHTML = '<strong>Date à déterminer.</strong><div class="muted">Ce dossier est bloqué tant que l’expertise ou la décision humaine n’est pas approuvée.</div>';
      return;
    }
    $('proposalStatus').textContent = `Devis ${state.selectedQuote.number} sélectionné. MAVIK peut proposer le premier créneau compatible.`;
  }

  function fillProposal(proposal) {
    if (!proposal || proposal.blocked) {
      $('proposalStatus').innerHTML = `<div class="alert">${esc(proposal?.status || 'Aucun créneau proposé.')}</div>`;
      return;
    }
    $('inspectionDate').value = proposal.inspection?.date || '';
    $('inspectionTime').value = proposal.inspection?.time || '10:00';
    $('dropoffDate').value = proposal.intervention?.dropoffDate || '';
    $('dropoffTime').value = proposal.intervention?.dropoffTime || '16:00';
    $('startDate').value = proposal.intervention?.startDate || '';
    $('endDate').value = proposal.intervention?.endDate || '';
    $('deliveryDate').value = proposal.intervention?.deliveryDate || '';
    $('deliveryTime').value = proposal.intervention?.deliveryTime || '16:30';
    $('proposalStatus').innerHTML = `<strong>Proposition calculée</strong><div class="muted">Inspection ${esc(proposal.inspection.date)} à ${esc(proposal.inspection.time)} · intervention ${esc(proposal.intervention.startDate)} → ${esc(proposal.intervention.endDate)} · livraison ${esc(proposal.intervention.deliveryDate)}.</div>`;
  }

  async function propose() {
    if (!state.selectedQuote) selectQuote();
    if (!state.selectedQuote) return;
    $('proposalStatus').textContent = 'MAVIK vérifie les inspections, les interventions, les indisponibilités et la capacité atelier…';
    try {
      const result = await api('/api/planning/propose', { method: 'POST', body: JSON.stringify({ quoteId: state.selectedQuote.id, durationDays: 2, expertRequired: state.selectedQuote.expertRequired, expertApproved: state.selectedQuote.expertReviewStatus === 'Approuvée' }) });
      state.proposal = result.proposal || result;
      fillProposal(state.proposal);
    } catch (error) { $('proposalStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }

  function schedulePayload(confirmed = false) {
    return {
      quoteId: $('scheduleQuote').value,
      inspectionDate: $('inspectionDate').value,
      inspectionTime: $('inspectionTime').value,
      dropoffDate: $('dropoffDate').value,
      dropoffTime: $('dropoffTime').value,
      startDate: $('startDate').value,
      endDate: $('endDate').value,
      deliveryDate: $('deliveryDate').value,
      deliveryTime: $('deliveryTime').value,
      confirmed
    };
  }

  async function saveSchedule(confirmed = false) {
    if (!$('scheduleQuote').value) return;
    $('scheduleStatus').innerHTML = '<div class="status">Contrôle des conflits…</div>';
    try {
      const result = await api('/api/planning/schedule', { method: 'POST', body: JSON.stringify(schedulePayload(confirmed)) });
      $('scheduleStatus').innerHTML = `<div class="alert ok">Planning ${confirmed ? 'confirmé en interne' : 'enregistré comme proposition'} pour ${esc(result.quote.number)}.</div>`;
      await load();
    } catch (error) {
      const conflict = error.conflicts?.length ? ` — conflit : ${error.conflicts.join(', ')}` : '';
      $('scheduleStatus').innerHTML = `<div class="alert bad">${esc(error.message + conflict)}</div>`;
    }
  }

  async function createBlock(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    $('blockStatus').innerHTML = '<div class="status">Enregistrement…</div>';
    try {
      await api('/api/planning/blocks', { method: 'POST', body: JSON.stringify(body) });
      $('blockStatus').innerHTML = '<div class="alert ok">Indisponibilité enregistrée.</div>';
      event.currentTarget.reset();
      const today = new Date().toISOString().slice(0, 10);
      event.currentTarget.elements.startDate.value = today;
      event.currentTarget.elements.endDate.value = today;
      event.currentTarget.elements.startTime.value = '08:30';
      event.currentTarget.elements.endTime.value = '17:00';
      await load();
    } catch (error) { $('blockStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }

  async function load() {
    $('calendar').innerHTML = '<div class="muted">Chargement du planning…</div>';
    try {
      const result = await api(`/api/planning/overview?from=${encodeURIComponent(state.from)}&days=${state.days}`);
      state.overview = result;
      renderCalendar();
      $('businessHours').textContent = `${result.businessHours?.morning || '08:30–12:00'} · ${result.businessHours?.afternoon || '13:30–17:00'}`;
    } catch (error) { $('calendar').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }

  function moveWindow(amount) { state.from = addDays(state.from, amount); load(); }

  function init() {
    const today = new Date().toISOString().slice(0, 10);
    const blockForm = $('blockForm');
    blockForm.elements.startDate.value = today;
    blockForm.elements.endDate.value = today;
    $('previousButton').onclick = () => moveWindow(-14);
    $('nextButton').onclick = () => moveWindow(14);
    $('todayButton').onclick = () => { state.from = today; load(); };
    $('daysSelect').onchange = () => { state.days = Number($('daysSelect').value || 42); load(); };
    $('scheduleQuote').onchange = selectQuote;
    $('proposeButton').onclick = propose;
    $('scheduleForm').onsubmit = (event) => { event.preventDefault(); saveSchedule(false); };
    $('confirmScheduleButton').onclick = () => saveSchedule(true);
    $('blockForm').onsubmit = createBlock;
    load();
  }

  init();
})();
