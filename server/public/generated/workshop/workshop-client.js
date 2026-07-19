(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { user: null, records: [], selectedId: '', data: {} };
  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Erreur ${response.status}`); error.missingFields = data.missingFields || []; throw error; }
    return data;
  }
  function toast(message, bad = false) {
    const element = $('toast'); element.textContent = message; element.style.borderColor = bad ? 'rgba(255,130,122,.55)' : 'rgba(120,220,138,.45)'; element.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 5200);
  }
  function now() { return new Date().toISOString(); }
  function stageFor(label, index, total) {
    const value = String(label || '').toLowerCase();
    if (/identifier|réception|reception|réserves|client.*zones/.test(value)) return '1. Réception et état d’entrée';
    if (/sécuriser|stabiliser|déposer|protéger|consignation|autorisation|accès|balisage/.test(value)) return '2. Préparation et sécurité';
    if (/essai|traiter|cryo|pression|buse|glace|compatibilité/.test(value)) return '3. Traitement cryogénique';
    if (/dinitrol|anticorrosion|masquer|corps creux|produits|lots|séchage/.test(value)) return '4. Protection et traçabilité';
    if (/remonter|serrer/.test(value)) return '5. Remontage et contrôle mécanique';
    if (/contrôle final|rapport|avant\/après|traçabilité spécifique/.test(value) || index === total - 1) return '6. Contrôle final et rapport';
    return '3. Traitement et contrôle';
  }
  function buildSteps(procedure) {
    const checklist = procedure?.checklist || [];
    return checklist.map((label, index) => ({ id: `ETAPE-${String(index + 1).padStart(2, '0')}`, order: index + 1, stage: stageFor(label, index, checklist.length), label, status: 'À faire', mandatory: true, evidenceRequired: /photo|document|tracer|rapport|consigner|autorisation/i.test(label), evidence: [], note: '' }));
  }
  function accepted(quote) { return /accept|acompte reçu|intervention planifiée/i.test(`${quote.status || ''} ${quote.workflowStatus || ''}`); }
  function depositReceived(quote) { return Boolean(quote.depositReceivedAt || quote.paymentStatus === 'Acompte reçu' || /acompte reçu|intervention planifiée/i.test(quote.workflowStatus || '')); }
  function procedureFor(quote, vehicle, procedures) {
    const category = quote.requestCategory || quote.vehicleType || vehicle?.requestCategory || vehicle?.vehicleType || 'autre';
    return quote.workshopProcedure || procedures.find((item) => item.requestCategory === category || item.vehicleType === category) || procedures.find((item) => item.requestCategory === 'autre');
  }
  async function loadRaw() {
    const [me, clients, vehicles, quotes, interventions, tasks, procedures] = await Promise.all([
      api('/api/auth/me'), api('/api/local/clients'), api('/api/local/vehicles'), api('/api/local/quotes'), api('/api/local/interventions'), api('/api/local/tasks'), api('/api/workshop/procedures')
    ]);
    state.user = me.user;
    state.data = { clients: clients.records || [], vehicles: vehicles.records || [], quotes: quotes.records || [], interventions: interventions.records || [], tasks: tasks.records || [], procedures: procedures.records || [] };
  }
  async function ensureAcceptedFiles() {
    for (const quote of state.data.quotes.filter(accepted)) {
      const vehicle = state.data.vehicles.find((item) => item.id === quote.vehicleId) || {};
      const procedure = procedureFor(quote, vehicle, state.data.procedures);
      if (!procedure) continue;
      const unlocked = depositReceived(quote);
      let intervention = state.data.interventions.find((item) => item.id === quote.interventionId || item.quoteId === quote.id);
      if (!intervention) {
        intervention = await api('/api/local/interventions', { method: 'POST', body: JSON.stringify({
          vehicleId: quote.vehicleId, clientId: quote.clientId, quoteId: quote.id, service: quote.service,
          status: unlocked ? 'Planifiée' : 'Préparation atelier — acompte en attente', workStatus: 'À préparer', workflowStatus: unlocked ? 'Intervention planifiée' : 'Devis accepté — préparation atelier',
          scheduledDate: quote.estimatedStartDate || '', estimatedStartDate: quote.estimatedStartDate || '', estimatedEndDate: quote.estimatedEndDate || '', estimatedDeliveryDate: quote.estimatedDeliveryDate || '',
          requestCategory: quote.requestCategory || quote.vehicleType || vehicle.requestCategory || vehicle.vehicleType || 'autre', workshopProcedureKey: procedure.key, workshopProcedure: procedure, procedureVersion: procedure.version || '1.0',
          procedureSteps: buildSteps(procedure), procedurePreparedAt: now(), procedurePreparedByName: 'MAVIK', workshopLocked: !unlocked, startAllowed: unlocked, depositReceived: unlocked
        }) });
        state.data.interventions.unshift(intervention);
        await api(`/api/local/quotes/${encodeURIComponent(quote.id)}`, { method: 'PATCH', body: JSON.stringify({ interventionId: intervention.id, workshopStatus: intervention.status, workshopProcedureKey: procedure.key }) });
        quote.interventionId = intervention.id;
      } else {
        const patch = {};
        if (!intervention.workshopProcedure) Object.assign(patch, { workshopProcedure: procedure, workshopProcedureKey: procedure.key, procedureVersion: procedure.version || '1.0' });
        if (!Array.isArray(intervention.procedureSteps) || !intervention.procedureSteps.length) patch.procedureSteps = buildSteps(procedure);
        if (unlocked && intervention.workshopLocked !== false) Object.assign(patch, { workshopLocked: false, startAllowed: true, depositReceived: true, status: 'Planifiée', workflowStatus: 'Intervention planifiée' });
        if (Object.keys(patch).length) {
          intervention = await api(`/api/local/interventions/${encodeURIComponent(intervention.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
          const index = state.data.interventions.findIndex((item) => item.id === intervention.id); state.data.interventions[index] = intervention;
        }
      }
    }
  }
  function enrich(intervention) {
    const quote = state.data.quotes.find((item) => item.id === intervention.quoteId) || {};
    const vehicle = state.data.vehicles.find((item) => item.id === intervention.vehicleId) || {};
    const client = state.data.clients.find((item) => item.id === intervention.clientId) || {};
    const steps = intervention.procedureSteps || [];
    const completed = steps.filter((step) => step.status === 'Terminée').length;
    const progress = { total: steps.length, completed, percent: steps.length ? Math.round(completed * 100 / steps.length) : 0 };
    return { ...intervention, quote, vehicle, client, progress, canComplete: steps.length > 0 && steps.every((step) => !step.mandatory || step.status === 'Terminée') };
  }
  function rebuildRecords() {
    state.records = state.data.interventions.filter((item) => !/archiv|clôtur|annul/i.test(`${item.status || ''} ${item.workflowStatus || ''}`)).map(enrich).sort((a, b) => String(a.estimatedStartDate || a.scheduledDate || '9999').localeCompare(String(b.estimatedStartDate || b.scheduledDate || '9999')));
  }
  function vehicleLabel(record) { return [record.vehicle?.brand, record.vehicle?.model].filter(Boolean).join(' ') || record.vehicle?.label || 'Véhicule à identifier'; }
  function pillClass(record) { if (record.workshopLocked) return 'warn'; if (/contrôle final|erreur|retard/i.test(`${record.status} ${record.procedureStatus}`)) return 'bad'; if (/en cours|validée|terminée/i.test(`${record.status} ${record.procedureStatus}`)) return 'ok'; return ''; }
  function renderSummary() {
    $('mTotal').textContent = state.records.length;
    $('mLocked').textContent = state.records.filter((item) => item.workshopLocked).length;
    $('mReady').textContent = state.records.filter((item) => !item.workshopLocked && item.workStatus !== 'En cours').length;
    $('mFinal').textContent = state.records.filter((item) => item.procedureStatus === 'Contrôle final à valider').length;
  }
  function renderQueue() {
    $('queue').innerHTML = state.records.map((record) => `<button class="job ${record.id === state.selectedId ? 'active' : ''}" data-id="${esc(record.id)}"><strong>${esc(record.number || 'Intervention')}</strong><div class="meta">${esc(vehicleLabel(record))} · ${esc(record.client?.name || 'Client à compléter')}</div><div class="meta">${esc(record.workshopProcedure?.label || record.service || 'Procédure à définir')}</div><span class="pill ${pillClass(record)}">${esc(record.workshopLocked ? 'Acompte en attente' : (record.status || 'À préparer'))}</span> <span class="pill">${record.progress.percent} %</span></button>`).join('') || '<div class="empty">Aucun devis accepté ni intervention active.</div>';
    $('queue').querySelectorAll('[data-id]').forEach((button) => button.onclick = () => select(button.dataset.id));
  }
  function grouped(steps) { return steps.reduce((out, step) => { (out[step.stage || 'Procédure'] ||= []).push(step); return out; }, {}); }
  function actionButtons(record) {
    const result = [];
    const self = record.technicianId === state.user?.id || record.technician === state.user?.name;
    if (!record.technician || !self) result.push('<button class="primary" id="assignSelf">Prendre le dossier</button>');
    if (!record.workshopLocked) result.push(record.workStatus === 'En cours' || record.status === 'En cours' ? '<button class="warn" id="pauseWork">Mettre en attente</button>' : `<button class="primary" id="startWork">${record.actualStartAt ? 'Reprendre' : 'Commencer'}</button>`);
    return result.join('');
  }
  function renderDetail(record) {
    const direction = ['admin', 'associate'].includes(state.user?.role);
    const stages = grouped(record.procedureSteps || []);
    $('detail').innerHTML = `<div class="detail-head"><div><small class="meta">${esc(record.requestCategory || 'catégorie à définir')} · procédure v${esc(record.procedureVersion || '1.0')}</small><h2 class="detail-title">${esc(record.number || 'Intervention')} — ${esc(vehicleLabel(record))}</h2><div class="meta">${esc(record.workshopProcedure?.label || record.service || '')}</div></div><span class="pill ${pillClass(record)}">${esc(record.procedureStatus || record.status || 'À préparer')}</span></div>
    <div class="identity"><div><small>Client</small><strong>${esc(record.client?.name || 'À compléter')}</strong></div><div><small>Immatriculation</small><strong>${esc(record.vehicle?.registration || 'À compléter')}</strong></div><div><small>Planning</small><strong>${esc(record.estimatedStartDate || 'À définir')} → ${esc(record.estimatedEndDate || 'À définir')}</strong></div><div><small>Technicien</small><strong>${esc(record.technician || 'Non attribué')}</strong></div></div>
    <div class="lock ${record.workshopLocked ? '' : 'ok'}">${record.workshopLocked ? 'Dossier préparé. Travail verrouillé jusqu’à réception de l’acompte.' : 'Acompte enregistré : la procédure atelier peut être exécutée.'}</div><div class="progress"><span style="width:${record.progress.percent}%"></span></div><div class="meta">${record.progress.completed} étape(s) sur ${record.progress.total} — ${record.progress.percent} %</div><div class="actions">${actionButtons(record)}</div>
    <form class="reception" id="receptionForm"><div class="field"><label>Kilométrage d’entrée</label><input name="mileage" type="number" min="0" value="${Number(record.mileage || record.vehicle?.mileage || 0)}"></div><div class="field"><label>Observations d’entrée</label><textarea name="notes">${esc(record.entryNotes || '')}</textarea></div><div class="field"><label>Réserves / exclusions</label><textarea name="clientReservations">${esc(record.clientReservations || '')}</textarea></div><button type="submit">Enregistrer la réception</button></form>
    <div class="stages">${Object.entries(stages).map(([stage, steps]) => `<section class="stage"><h3>${esc(stage)}</h3>${steps.map((step) => `<article class="step ${step.status === 'Terminée' ? 'done' : ''}" data-step="${esc(step.id)}"><input type="checkbox" ${step.status === 'Terminée' ? 'checked' : ''} ${record.workshopLocked ? 'disabled' : ''}><div><div class="step-label"><strong>${esc(step.id)}</strong> — ${esc(step.label)}</div><div class="meta">${step.evidenceRequired ? 'Preuve ou traçabilité recommandée' : 'Validation opérateur'}${step.completedByName ? ` · ${esc(step.completedByName)}` : ''}</div><div class="proofs">${(step.evidence || []).map((proof) => `<a href="${esc(proof.url)}" target="_blank">📷 ${esc(proof.title || 'preuve')}</a>`).join('')}</div><div class="step-note"><input value="${esc(step.note || '')}" placeholder="Note technique"><button type="button" data-save>Enregistrer</button><button type="button" data-photo>Photo</button><input data-file type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div><button type="button" data-toggle>${step.status === 'Terminée' ? 'Rouvrir' : 'Valider'}</button></article>`).join('')}</section>`).join('')}</div>
    <section class="final"><h3>Clôture de la procédure</h3><p class="meta">L’employé demande le contrôle final. David ou Bénédicte valide ensuite la procédure avant la création du rapport et de la facture.</p><div class="field"><label>Notes finales</label><textarea id="finalNotes">${esc(record.finalNotes || '')}</textarea></div><div class="actions"><button id="requestFinal" type="button" ${record.canComplete ? '' : 'disabled'}>Demander le contrôle final</button>${direction && record.procedureStatus === 'Contrôle final à valider' ? '<button class="primary" id="approveFinal" type="button">Valider et terminer</button>' : ''}</div></section>`;
    bind(record);
  }
  function replaceIntervention(updated) { const index = state.data.interventions.findIndex((item) => item.id === updated.id); if (index >= 0) state.data.interventions[index] = updated; else state.data.interventions.unshift(updated); }
  async function patchIntervention(record, patch) { const updated = await api(`/api/local/interventions/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); replaceIntervention(updated); return updated; }
  async function refreshSelected(message) { await loadOverview(true); if (message) toast(message); }
  async function assign(record) { await patchIntervention(record, { technician: state.user?.name || '', technicianId: state.user?.id || '', assignedAt: now(), assignedByName: state.user?.name || '' }); await refreshSelected('Dossier pris en charge.'); }
  async function work(record, action) {
    try {
      if (record.workshopLocked) throw new Error('Acompte requis avant démarrage');
      const missing = (record.procedureSteps || []).slice(0, 3).filter((step) => step.status !== 'Terminée');
      if (['start', 'resume'].includes(action) && missing.length) throw new Error(`Réception incomplète : ${missing.map((item) => item.id).join(', ')}`);
      if (!record.technician) await assign(record);
      await api('/api/employee-flow/action', { method: 'POST', body: JSON.stringify({ targetType: 'intervention', targetId: record.id, action, reason: action === 'pause' ? 'Mise en attente depuis l’atelier' : '', workstationReleased: action === 'pause' }) });
      await refreshSelected(action === 'pause' ? 'Intervention mise en attente.' : 'Intervention démarrée ou reprise.');
    } catch (error) { toast(error.message, true); }
  }
  async function saveStep(record, stepId, complete, note) {
    if (complete && record.workshopLocked) return toast('Acompte requis avant validation des étapes.', true);
    const steps = (record.procedureSteps || []).map((step) => step.id === stepId ? { ...step, status: complete ? 'Terminée' : 'À faire', note, startedAt: step.startedAt || (complete ? now() : ''), completedAt: complete ? now() : '', completedByUserId: complete ? state.user?.id || '' : '', completedByName: complete ? state.user?.name || '' : '' } : step);
    await patchIntervention(record, { procedureSteps: steps, procedureProgress: { total: steps.length, completed: steps.filter((item) => item.status === 'Terminée').length }, lastProcedureActionAt: now(), lastProcedureActionByName: state.user?.name || '' });
    await refreshSelected('Étape enregistrée.');
  }
  function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
  async function upload(record, stepId, file, note) {
    if (!file) return;
    if (file.size > 8_000_000) return toast('Photo trop volumineuse : maximum 8 Mo.', true);
    try {
      const dataUrl = await readFile(file);
      const photo = await api('/api/local/photos', { method: 'POST', body: JSON.stringify({ title: `${record.number} — ${stepId} — ${file.name}`, url: dataUrl, category: 'Preuve atelier', interventionId: record.id, vehicleId: record.vehicleId, quoteId: record.quoteId, stepId }) });
      const steps = (record.procedureSteps || []).map((step) => step.id === stepId ? { ...step, evidence: [...(step.evidence || []), { id: photo.id, url: photo.url, title: file.name, note, createdAt: now(), createdByName: state.user?.name || '' }] } : step);
      await patchIntervention(record, { procedureSteps: steps }); await refreshSelected('Photo ajoutée à la procédure.');
    } catch (error) { toast(`Photo : ${error.message}`, true); }
  }
  async function requestFinal(record) {
    const missing = (record.procedureSteps || []).filter((step) => step.mandatory && step.status !== 'Terminée');
    if (missing.length) return toast(`Procédure incomplète : ${missing.map((step) => step.id).join(', ')}`, true);
    await patchIntervention(record, { procedureStatus: 'Contrôle final à valider', finalValidationRequestedAt: now(), finalValidationRequestedByUserId: state.user?.id || '', finalValidationRequestedByName: state.user?.name || '', finalNotes: $('finalNotes').value, workStatus: 'En attente', status: 'Contrôle final à valider', workstationReleased: true });
    const exists = state.data.tasks.some((task) => task.interventionId === record.id && /contrôle final atelier/i.test(task.title || '') && task.status !== 'Terminée');
    if (!exists) await api('/api/local/tasks', { method: 'POST', body: JSON.stringify({ title: `Valider le contrôle final atelier — ${record.number}`, status: 'À faire', priority: 'Haute', assignee: 'David / Bénédicte', interventionId: record.id, quoteId: record.quoteId, clientId: record.clientId, vehicleId: record.vehicleId, instructions: 'Contrôler la procédure, les preuves et les réserves avant génération du rapport.' }) });
    await refreshSelected('Contrôle final demandé à la direction.');
  }
  async function approveFinal(record) {
    if (!['admin', 'associate'].includes(state.user?.role)) return toast('Validation réservée à David ou Bénédicte.', true);
    if (!confirm('Confirmer la validation finale ? Le rapport et la facture seront générés en brouillons.')) return;
    await patchIntervention(record, { procedureStatus: 'Validée par la direction', finalApprovedAt: now(), finalApprovedByUserId: state.user?.id || '', finalApprovedByName: state.user?.name || '', finalApprovalNote: $('finalNotes').value });
    await api(`/api/quotes/${encodeURIComponent(record.quoteId)}/transition`, { method: 'POST', body: JSON.stringify({ action: 'complete' }) });
    await refreshSelected('Procédure validée. Rapport et facture créés en brouillons.');
  }
  function bind(record) {
    $('assignSelf')?.addEventListener('click', () => assign(record));
    $('startWork')?.addEventListener('click', () => work(record, record.actualStartAt ? 'resume' : 'start'));
    $('pauseWork')?.addEventListener('click', () => work(record, 'pause'));
    $('receptionForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await patchIntervention(record, { receivedAt: record.receivedAt || now(), receivedByUserId: state.user?.id || '', receivedByName: state.user?.name || '', mileage: Number(form.get('mileage') || 0), entryNotes: form.get('notes'), clientReservations: form.get('clientReservations'), keysReceived: true, status: record.workshopLocked ? 'Réceptionné — acompte en attente' : 'Réceptionné — préparation' }); await refreshSelected('Réception enregistrée.'); });
    document.querySelectorAll('[data-step]').forEach((row) => { const stepId = row.dataset.step; const step = record.procedureSteps.find((item) => item.id === stepId); const note = row.querySelector('.step-note input:not([type=file])'); row.querySelector('[data-toggle]').onclick = () => saveStep(record, stepId, step.status !== 'Terminée', note.value); row.querySelector('[data-save]').onclick = () => saveStep(record, stepId, step.status === 'Terminée', note.value); const file = row.querySelector('[data-file]'); row.querySelector('[data-photo]').onclick = () => file.click(); file.onchange = () => upload(record, stepId, file.files?.[0], note.value); });
    $('requestFinal')?.addEventListener('click', () => requestFinal(record));
    $('approveFinal')?.addEventListener('click', () => approveFinal(record));
  }
  async function select(id) { state.selectedId = id; renderQueue(); const record = state.records.find((item) => item.id === id); if (record) renderDetail(record); }
  async function loadOverview(preserve = true) {
    try {
      await loadRaw(); await ensureAcceptedFiles(); rebuildRecords(); renderSummary();
      if (!preserve || !state.records.some((item) => item.id === state.selectedId)) state.selectedId = state.records[0]?.id || '';
      renderQueue(); if (state.selectedId) renderDetail(state.records.find((item) => item.id === state.selectedId)); else $('detail').innerHTML = '<div class="empty">Aucun dossier atelier disponible.</div>';
    } catch (error) { toast(`Atelier : ${error.message}`, true); }
  }
  window.loadOverview = loadOverview;
  loadOverview(false);
})();
