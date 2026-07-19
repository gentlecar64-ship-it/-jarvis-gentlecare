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
    proposal: null,
    workQueue: null,
    leave: null,
    me: null,
    leaveAdvice: null
  };

  function installExtraStyles() {
    const style = document.createElement('style');
    style.textContent = `.event.congé{border-left-color:#f0a8dc;background:rgba(119,53,98,.25)}.work-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.work-card{padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(2,12,17,.48)}.work-card.active{border-color:rgba(145,188,91,.55);box-shadow:0 0 0 2px rgba(145,188,91,.08) inset}.work-card.paused{border-color:rgba(255,207,114,.45)}.work-card .actions{margin-top:9px}.policy-box{padding:11px;border:1px solid rgba(145,188,91,.28);border-radius:14px;background:rgba(86,122,51,.12);margin-bottom:11px}.leave-grid{display:grid;grid-template-columns:minmax(280px,.75fr) minmax(0,1.25fr);gap:12px}.decision-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}@media(max-width:850px){.work-columns,.leave-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function ensureEmployeeSections() {
    if ($('my-work')) return;
    const main = document.querySelector('main.shell');
    const section = document.createElement('section');
    section.innerHTML = `
      <section class="panel" id="my-work" style="margin-top:13px">
        <div class="toolbar"><div><h2>Ma checklist et mon travail</h2><div class="muted">Mettre en attente, changer de véhicule ou de tâche, reprendre, terminer. Commencer en avance est autorisé ; repousser une date ne l’est pas.</div></div><button id="refreshWorkButton" type="button">Actualiser</button></div>
        <div class="policy-box"><strong>Règle atelier : avance oui, retard non.</strong><div class="muted">Un employé peut commencer plus tôt et mettre un travail en attente sans modifier les dates promises. Tout report doit être validé par David ou Bénédicte.</div></div>
        <div id="workStatus"></div><div class="work-columns"><div><h3>Véhicules</h3><div id="workInterventions" class="list"></div></div><div><h3>Tâches</h3><div id="workTasks" class="list"></div></div></div>
      </section>
      <section class="panel" id="leave" style="margin-top:13px">
        <div class="toolbar"><div><h2>Congés — avis puis validation</h2><div class="muted">Jarvis consulte votre planning, celui de l’équipe et la charge de l’atelier. L’accord de principe n’est jamais une validation définitive.</div></div><button id="refreshLeaveButton" type="button">Actualiser</button></div>
        <div class="leave-grid"><form id="leaveForm"><div class="form-grid"><div><label>Début</label><input name="startDate" type="date" required></div><div><label>Fin</label><input name="endDate" type="date" required></div><div style="grid-column:1/-1"><label>Motif facultatif</label><textarea name="reason" placeholder="Congés, rendez-vous personnel…"></textarea></div></div><div class="actions"><button type="button" id="leaveAdviceButton">Demander l’avis de Jarvis</button><button class="primary" type="submit" id="leaveSubmitButton" disabled>Soumettre au responsable</button></div><div id="leaveAdviceStatus"></div></form><div><h3>Mes demandes</h3><div id="myLeaveRequests" class="list"></div><div id="managerLeavePanel" style="display:none"><h3 style="margin-top:13px">À valider</h3><div id="pendingLeaveRequests" class="list"></div></div></div></div>
      </section>`;
    while (section.firstElementChild) main.appendChild(section.firstElementChild);
  }

  function dateLabel(value, options = {}) {
    if (!value) return 'Date à définir';
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('fr-FR', { weekday: options.short ? 'short' : 'long', day: '2-digit', month: options.short ? 'short' : 'long', year: options.year ? 'numeric' : undefined }).format(date);
  }
  function addDays(value, amount) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount); return date.toISOString().slice(0, 10); }
  function eachDate(from, days) { return Array.from({ length: days }, (_, index) => addDays(from, index)); }
  function eventClass(type = '') { return String(type).toLowerCase().replace(/[^a-zà-ÿ]+/g, '-'); }
  function eventsForDate(date) { return (state.overview?.events || []).filter((event) => date >= event.date && date <= (event.endDate || event.date)); }

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
      return `<section class="day ${date === today ? 'today' : ''} ${weekend ? 'weekend' : ''}"><div class="day-head"><strong>${esc(dateLabel(date, { short: true }))}</strong><span>${esc(date)}</span></div><div class="events">${events.map((event) => `<article class="event ${esc(eventClass(event.type))}" title="${esc(event.status || '')}"><b>${esc(event.time ? `${event.time} · ${event.title}` : event.title)}</b><small>${esc([event.type, event.status, event.client, event.vehicle, event.assignee].filter(Boolean).join(' · '))}</small></article>`).join('') || '<span class="muted">Libre</span>'}</div></section>`;
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
    $('unscheduledQuotes').querySelectorAll('[data-plan-quote]').forEach((button) => button.onclick = () => { $('scheduleQuote').value = button.dataset.planQuote; selectQuote(); propose(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
  }

  function renderQuoteSelect() {
    const all = state.overview.unscheduledQuotes || [];
    const current = $('scheduleQuote').value;
    $('scheduleQuote').innerHTML = '<option value="">Choisir un devis</option>' + all.map((quote) => `<option value="${esc(quote.id)}">${esc(quote.number)} — ${esc(quote.client || '')} — ${esc(quote.vehicle || '')}</option>`).join('');
    if (all.some((quote) => quote.id === current)) $('scheduleQuote').value = current;
    const queryQuote = new URLSearchParams(location.search).get('quote');
    if (queryQuote && all.some((quote) => quote.id === queryQuote)) { $('scheduleQuote').value = queryQuote; selectQuote(); }
  }

  function selectQuote() {
    const id = $('scheduleQuote').value;
    state.selectedQuote = (state.overview.unscheduledQuotes || []).find((quote) => quote.id === id) || null;
    state.proposal = null;
    if (!state.selectedQuote) { $('proposalStatus').textContent = 'Sélectionnez un devis.'; return; }
    if (state.selectedQuote.expertRequired && state.selectedQuote.expertReviewStatus !== 'Approuvée') { $('proposalStatus').innerHTML = '<strong>Date à déterminer.</strong><div class="muted">Ce dossier est bloqué tant que l’expertise ou la décision humaine n’est pas approuvée.</div>'; return; }
    $('proposalStatus').textContent = `Devis ${state.selectedQuote.number} sélectionné. MAVIK peut proposer le premier créneau compatible.`;
  }

  function fillProposal(proposal) {
    if (!proposal || proposal.blocked) { $('proposalStatus').innerHTML = `<div class="alert">${esc(proposal?.status || 'Aucun créneau proposé.')}</div>`; return; }
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

  function schedulePayload(confirmed = false) { return { quoteId: $('scheduleQuote').value, inspectionDate: $('inspectionDate').value, inspectionTime: $('inspectionTime').value, dropoffDate: $('dropoffDate').value, dropoffTime: $('dropoffTime').value, startDate: $('startDate').value, endDate: $('endDate').value, deliveryDate: $('deliveryDate').value, deliveryTime: $('deliveryTime').value, confirmed }; }
  async function saveSchedule(confirmed = false) {
    if (!$('scheduleQuote').value) return;
    $('scheduleStatus').innerHTML = '<div class="status">Contrôle des conflits…</div>';
    try { const result = await api('/api/planning/schedule', { method: 'POST', body: JSON.stringify(schedulePayload(confirmed)) }); $('scheduleStatus').innerHTML = `<div class="alert ok">Planning ${confirmed ? 'confirmé en interne' : 'enregistré comme proposition'} pour ${esc(result.quote.number)}.</div>`; await load(); }
    catch (error) { const conflict = error.conflicts?.length ? ` — conflit : ${error.conflicts.join(', ')}` : ''; $('scheduleStatus').innerHTML = `<div class="alert bad">${esc(error.message + conflict)}</div>`; }
  }

  async function createBlock(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    $('blockStatus').innerHTML = '<div class="status">Enregistrement…</div>';
    try { await api('/api/planning/blocks', { method: 'POST', body: JSON.stringify(body) }); $('blockStatus').innerHTML = '<div class="alert ok">Indisponibilité enregistrée.</div>'; event.currentTarget.reset(); setBlockDefaults(); await load(); }
    catch (error) { $('blockStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }
  function setBlockDefaults() { const form = $('blockForm'); const today = new Date().toISOString().slice(0, 10); form.elements.startDate.value = today; form.elements.endDate.value = today; form.elements.startTime.value = '08:30'; form.elements.endTime.value = '17:00'; }

  function workCard(item) {
    const status = item.workStatus || item.status || 'À faire';
    const active = status === 'En cours';
    const paused = /attente/i.test(status);
    const date = item.targetType === 'intervention' ? (item.scheduledDate || item.estimatedStartDate) : item.dueDate;
    return `<article class="work-card ${active ? 'active' : ''} ${paused ? 'paused' : ''}"><strong>${esc(item.displayLabel)}</strong><div class="muted">${esc([date ? dateLabel(date, { short: true }) : '', status, item.startedAheadOfSchedule ? 'commencé en avance' : '', item.scheduleRisk].filter(Boolean).join(' · '))}</div><div class="actions">${active ? `<button data-work-action="pause" data-type="${item.targetType}" data-id="${item.id}">Mettre en attente</button><button class="primary" data-work-action="complete" data-type="${item.targetType}" data-id="${item.id}">Terminer</button>` : `<button class="primary" data-work-action="${paused ? 'resume' : 'start'}" data-type="${item.targetType}" data-id="${item.id}">${paused ? 'Reprendre' : (item.canStartEarly ? 'Commencer en avance' : 'Commencer')}</button>`}</div></article>`;
  }
  function renderWork() {
    const queue = state.workQueue || { interventions: [], tasks: [] };
    $('workInterventions').innerHTML = queue.interventions.map(workCard).join('') || '<div class="muted">Aucun véhicule ne vous est affecté.</div>';
    $('workTasks').innerHTML = queue.tasks.map(workCard).join('') || '<div class="muted">Aucune tâche ne vous est affectée.</div>';
    $('workStatus').innerHTML = queue.activeInterventions?.length || queue.activeTasks?.length ? '<div class="alert ok">Un travail est en cours. Démarrer un autre élément met automatiquement la priorité actuelle en attente.</div>' : '<div class="status">Aucun travail actif. Vous pouvez commencer un élément prévu, y compris en avance.</div>';
    document.querySelectorAll('[data-work-action]').forEach((button) => button.onclick = () => workAction(button));
  }
  async function workAction(button) {
    const action = button.dataset.workAction;
    let reason = '';
    if (action === 'pause') reason = prompt('Motif de la mise en attente (facultatif) :', 'Changement de priorité') || '';
    $('workStatus').innerHTML = '<div class="status">Mise à jour de la checklist…</div>';
    try {
      const result = await api('/api/employee-flow/action', { method: 'POST', body: JSON.stringify({ targetType: button.dataset.type, targetId: button.dataset.id, action, reason, workstationReleased: true }) });
      $('workStatus').innerHTML = `<div class="alert ok">${esc(result.item.displayLabel || result.item.number || result.item.title || 'Travail')} : ${esc(result.item.workStatus || result.item.status)}.${result.paused?.length ? ` ${result.paused.length} autre élément mis en attente.` : ''}</div>`;
      await loadWork(); await loadPlanningOnly();
    } catch (error) { $('workStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }
  async function loadWork() { state.workQueue = await api('/api/employee-flow/queue'); renderWork(); }

  function leaveCard(request, manager = false) {
    return `<article class="card"><strong>${esc(request.number || 'Demande')} — ${esc(request.employeeName || '')}</strong><div class="muted">${esc(dateLabel(request.startDate, { short: true }))} → ${esc(dateLabel(request.endDate, { short: true }))} · ${esc(request.workdays)} jour(s) · ${esc(request.principleStatus || '')}</div><div class="status">${esc(request.status)}</div>${manager ? `<div class="decision-row"><button class="primary" data-leave-decision="approve" data-id="${request.id}">Valider</button><button class="danger" data-leave-decision="refuse" data-id="${request.id}">Refuser</button></div>` : ''}</article>`;
  }
  function renderLeave() {
    const leave = state.leave || { mine: [], pending: [], canValidate: false };
    $('myLeaveRequests').innerHTML = leave.mine.map((item) => leaveCard(item, false)).join('') || '<div class="muted">Aucune demande de congé.</div>';
    $('managerLeavePanel').style.display = leave.canValidate ? 'block' : 'none';
    if (leave.canValidate) $('pendingLeaveRequests').innerHTML = leave.pending.map((item) => leaveCard(item, true)).join('') || '<div class="muted">Aucune demande à valider.</div>';
    document.querySelectorAll('[data-leave-decision]').forEach((button) => button.onclick = () => decideLeave(button));
  }
  async function leaveAdvice() {
    const form = $('leaveForm');
    const body = { startDate: form.elements.startDate.value, endDate: form.elements.endDate.value, reason: form.elements.reason.value };
    $('leaveAdviceStatus').innerHTML = '<div class="status">Jarvis consulte les plannings et la charge atelier…</div>';
    try {
      const result = await api('/api/leave/advice', { method: 'POST', body: JSON.stringify(body) });
      state.leaveAdvice = result.advice;
      const cls = result.advice.decision === 'favorable' ? 'ok' : result.advice.decision === 'defavorable' ? 'bad' : '';
      $('leaveAdviceStatus').innerHTML = `<div class="alert ${cls}"><strong>${esc(result.advice.principleStatus)} — ${esc(result.advice.score)}/100</strong><div>${esc([...(result.advice.reasons || []), ...(result.advice.warnings || [])].join(' '))}</div><div class="muted">Validation finale obligatoire.</div></div>`;
      $('leaveSubmitButton').disabled = false;
    } catch (error) { $('leaveAdviceStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }
  async function submitLeave(event) {
    event.preventDefault();
    if (!state.leaveAdvice) return leaveAdvice();
    const form = event.currentTarget;
    try {
      const result = await api('/api/leave/requests', { method: 'POST', body: JSON.stringify({ startDate: form.elements.startDate.value, endDate: form.elements.endDate.value, reason: form.elements.reason.value }) });
      $('leaveAdviceStatus').innerHTML = `<div class="alert ok">Demande ${esc(result.request.number)} transmise. Statut : en attente de validation.</div>`;
      state.leaveAdvice = null; $('leaveSubmitButton').disabled = true; await loadLeave(); await loadPlanningOnly();
    } catch (error) { $('leaveAdviceStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }
  async function decideLeave(button) {
    const approved = button.dataset.leaveDecision === 'approve';
    const comment = prompt(approved ? 'Commentaire de validation (facultatif) :' : 'Motif du refus :', '') || '';
    try { await api(`/api/leave/requests/${encodeURIComponent(button.dataset.id)}/decision`, { method: 'POST', body: JSON.stringify({ approved, comment }) }); await loadLeave(); await loadPlanningOnly(); }
    catch (error) { $('leaveAdviceStatus').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }
  async function loadLeave() { state.leave = await api('/api/leave/overview'); renderLeave(); }

  async function loadPlanningOnly() {
    const result = await api(`/api/planning/overview?from=${encodeURIComponent(state.from)}&days=${state.days}`);
    state.overview = result; renderCalendar(); $('businessHours').textContent = `${result.businessHours?.morning || '08:30–12:00'} · ${result.businessHours?.afternoon || '13:30–17:00'}`;
  }
  async function load() {
    $('calendar').innerHTML = '<div class="muted">Chargement du planning…</div>';
    try {
      const [overview, workQueue, leave, me] = await Promise.all([api(`/api/planning/overview?from=${encodeURIComponent(state.from)}&days=${state.days}`), api('/api/employee-flow/queue'), api('/api/leave/overview'), api('/api/auth/me')]);
      state.overview = overview; state.workQueue = workQueue; state.leave = leave; state.me = me.user;
      renderCalendar(); renderWork(); renderLeave();
      $('businessHours').textContent = `${overview.businessHours?.morning || '08:30–12:00'} · ${overview.businessHours?.afternoon || '13:30–17:00'}`;
    } catch (error) { $('calendar').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }
  function moveWindow(amount) { state.from = addDays(state.from, amount); loadPlanningOnly(); }

  function init() {
    installExtraStyles(); ensureEmployeeSections(); setBlockDefaults();
    const today = new Date().toISOString().slice(0, 10);
    const leaveForm = $('leaveForm'); leaveForm.elements.startDate.value = today; leaveForm.elements.endDate.value = today;
    $('previousButton').onclick = () => moveWindow(-14);
    $('nextButton').onclick = () => moveWindow(14);
    $('todayButton').onclick = () => { state.from = today; loadPlanningOnly(); };
    $('daysSelect').onchange = () => { state.days = Number($('daysSelect').value || 42); loadPlanningOnly(); };
    $('scheduleQuote').onchange = selectQuote;
    $('proposeButton').onclick = propose;
    $('scheduleForm').onsubmit = (event) => { event.preventDefault(); saveSchedule(false); };
    $('confirmScheduleButton').onclick = () => saveSchedule(true);
    $('blockForm').onsubmit = createBlock;
    $('refreshWorkButton').onclick = loadWork;
    $('refreshLeaveButton').onclick = loadLeave;
    $('leaveAdviceButton').onclick = leaveAdvice;
    leaveForm.onsubmit = submitLeave;
    load();
  }

  init();
})();
