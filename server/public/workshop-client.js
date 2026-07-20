(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { records: [], selectedId: '', current: null, user: null };

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Erreur ${response.status}`);
      error.missingFields = data.missingFields || [];
      throw error;
    }
    return data;
  }
  function toast(message, bad = false) {
    const element = $('toast');
    element.textContent = message;
    element.style.borderColor = bad ? 'rgba(255,130,122,.55)' : 'rgba(120,220,138,.45)';
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 5200);
  }
  function pillClass(record) {
    if (record.workshopLocked) return 'warn';
    if (/contrôle final|erreur|retard/i.test(`${record.status} ${record.procedureStatus}`)) return 'bad';
    if (/en cours|validée|terminée/i.test(`${record.status} ${record.procedureStatus}`)) return 'ok';
    return '';
  }
  function vehicleLabel(record) {
    const vehicle = record.vehicle || {};
    return [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || vehicle.label || 'Véhicule à identifier';
  }
  function renderQueue() {
    const queue = $('queue');
    queue.innerHTML = state.records.map((record) => `
      <button class="job ${record.id === state.selectedId ? 'active' : ''}" data-id="${esc(record.id)}">
        <strong>${esc(record.number || 'Intervention')}</strong>
        <div class="meta">${esc(vehicleLabel(record))} · ${esc(record.client?.name || 'Client à compléter')}</div>
        <div class="meta">${esc(record.workshopProcedure?.label || record.service || 'Procédure à définir')}</div>
        <span class="pill ${pillClass(record)}">${esc(record.workshopLocked ? 'Acompte en attente' : (record.status || 'À préparer'))}</span>
        <span class="pill">${Number(record.progress?.percent || 0)} %</span>
      </button>`).join('') || '<div class="empty">Aucun devis accepté ni intervention active.</div>';
    queue.querySelectorAll('[data-id]').forEach((button) => button.onclick = () => select(button.dataset.id));
  }
  function setMetrics(summary = {}) {
    $('mTotal').textContent = summary.total || 0;
    $('mLocked').textContent = summary.waitingDeposit || 0;
    $('mReady').textContent = summary.ready || 0;
    $('mFinal').textContent = summary.finalValidation || 0;
  }
  async function loadOverview(preserve = true) {
    try {
      const [overview, me] = await Promise.all([api('/api/workshop/overview'), state.user ? Promise.resolve({ user: state.user }) : api('/api/auth/me')]);
      state.user = me.user;
      state.records = overview.records || [];
      setMetrics(overview.summary);
      if (!preserve || !state.records.some((item) => item.id === state.selectedId)) state.selectedId = state.records[0]?.id || '';
      renderQueue();
      if (state.selectedId) await loadDetail(state.selectedId);
      else $('detail').innerHTML = '<div class="empty">Aucun dossier atelier disponible.</div>';
    } catch (error) { toast(`Atelier : ${error.message}`, true); }
  }
  async function select(id) {
    state.selectedId = id;
    renderQueue();
    await loadDetail(id);
  }
  function groupedSteps(steps = []) {
    return steps.reduce((groups, step) => {
      const stage = step.stage || 'Procédure';
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(step);
      return groups;
    }, {});
  }
  function actionButtons(record) {
    const buttons = [];
    const selfAssigned = record.technician && state.user && (record.technicianId === state.user.id || record.technician === state.user.name);
    if (!record.technician || !selfAssigned) buttons.push('<button class="primary" id="assignSelf">Prendre le dossier</button>');
    if (!record.workshopLocked) {
      if (record.workStatus === 'En cours' || record.status === 'En cours') buttons.push('<button class="warn" id="pauseWork">Mettre en attente</button>');
      else buttons.push(`<button class="primary" id="startWork">${record.actualStartAt ? 'Reprendre' : 'Commencer'}</button>`);
    }
    return buttons.join('');
  }
  function renderDetail(record) {
    state.current = record;
    const direction = ['admin', 'associate'].includes(state.user?.role);
    const grouped = groupedSteps(record.procedureSteps || []);
    const progress = record.progress || { percent: 0, completed: 0, total: 0 };
    const report = record.reportReadiness || {};
    const reportMissing = [...(report.missingEvidence || []), ...(report.missingReportFields || [])];
    $('detail').innerHTML = `
      <div class="detail-head"><div><small class="meta">${esc(record.requestCategory || 'catégorie à définir')} · procédure v${esc(record.procedureVersion || '1.0')}</small><h2 class="detail-title">${esc(record.number || 'Intervention')} — ${esc(vehicleLabel(record))}</h2><div class="meta">${esc(record.workshopProcedure?.label || record.service || '')}</div></div><span class="pill ${pillClass(record)}">${esc(record.procedureStatus || record.status || 'À préparer')}</span></div>
      <div class="identity"><div><small>Client</small><strong>${esc(record.client?.name || 'À compléter')}</strong></div><div><small>Immatriculation</small><strong>${esc(record.vehicle?.registration || 'À compléter')}</strong></div><div><small>Planning</small><strong>${esc(record.estimatedStartDate || 'À définir')} → ${esc(record.estimatedEndDate || 'À définir')}</strong></div><div><small>Technicien</small><strong>${esc(record.technician || 'Non attribué')}</strong></div></div>
      <div class="lock ${record.workshopLocked ? '' : 'ok'}">${record.workshopLocked ? 'Dossier atelier préparé. Le travail reste verrouillé jusqu’à réception de l’acompte.' : 'Acompte enregistré : la procédure atelier peut être exécutée.'}</div>
      <div class="progress"><span style="width:${Number(progress.percent || 0)}%"></span></div><div class="meta" style="margin-top:6px">${progress.completed || 0} étape(s) terminée(s) sur ${progress.total || 0} — ${progress.percent || 0} %</div>
      <div class="actions">${actionButtons(record)}</div>
      <form class="reception" id="receptionForm"><div class="field"><label>Kilométrage d’entrée</label><input name="mileage" type="number" min="0" value="${Number(record.mileage || record.vehicle?.mileage || 0)}"></div><div class="field"><label>Observations d’entrée</label><textarea name="notes" placeholder="État visible, dommages, corrosion, réserves…">${esc(record.entryNotes || '')}</textarea></div><div class="field"><label>Réserves client / exclusions</label><textarea name="clientReservations" placeholder="Zones exclues, démontages non autorisés…">${esc(record.clientReservations || '')}</textarea></div><button type="submit">Enregistrer la réception</button></form>
      <div class="stages">${Object.entries(grouped).map(([stage, steps]) => `<section class="stage"><h3>${esc(stage)}</h3>${steps.map((step) => `
        <article class="step ${step.status === 'Terminée' ? 'done' : ''}" data-step="${esc(step.id)}"><input type="checkbox" ${step.status === 'Terminée' ? 'checked' : ''} ${record.workshopLocked ? 'disabled' : ''} aria-label="Valider l’étape"><div><div class="step-label"><strong>${esc(step.id)}</strong> — ${esc(step.label)}</div><div class="meta">${step.evidenceRequired ? 'Preuve ou traçabilité recommandée' : 'Validation opérateur'}${step.completedByName ? ` · validé par ${esc(step.completedByName)}` : ''}</div><div class="proofs">${(step.evidence || []).map((proof) => `<a href="${esc(proof.url)}" target="_blank" rel="noopener">📷 ${esc(proof.title || 'preuve')}</a>`).join('')}</div><div class="step-note"><input value="${esc(step.note || '')}" placeholder="Note technique ou constat"><button type="button" data-save-note>Enregistrer</button><button type="button" data-photo>Ajouter une photo</button><input data-file type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div><button type="button" data-toggle>${step.status === 'Terminée' ? 'Rouvrir' : 'Valider'}</button></article>`).join('')}</section>`).join('')}</div>
      <section class="final"><h3>Clôture de la procédure</h3><p class="meta">Toutes les étapes obligatoires et leurs preuves doivent être terminées. L’employé demande ensuite le contrôle final. La direction valide avant que le rapport puisse être remis.</p><div class="field"><label>Notes finales</label><textarea id="finalNotes" placeholder="Résultat, réserves restantes, recommandations…">${esc(record.finalNotes || '')}</textarea></div><div class="actions"><button id="requestFinal" type="button" ${record.canComplete ? '' : 'disabled'}>Demander le contrôle final</button>${direction && record.procedureStatus === 'Contrôle final à valider' ? '<button class="primary" id="approveFinal" type="button">Valider le contrôle et préparer le rapport</button>' : ''}</div></section>
      <section class="final"><h3>Rapport d’intervention</h3><p class="meta">Statut : <strong>${esc(report.status || 'Non généré')}</strong>${report.version ? ` · version ${Number(report.version)}.0` : ''}. Le brouillon est généré après le contrôle de direction ; la remise client exige un rapport complet et une validation humaine.</p>${reportMissing.length ? `<div class="lock">À compléter : ${reportMissing.slice(0, 8).map(esc).join(' · ')}</div>` : '<div class="lock ok">Aucun manque documentaire actuellement détecté.</div>'}<div class="actions">${report.url ? `<a class="button primary" href="${esc(report.url)}" target="_blank" rel="noopener">Ouvrir le rapport</a>` : ''}${report.canGenerate && !report.url ? '<button id="generateReport" type="button">Générer le brouillon</button>' : ''}${direction && report.url ? `<button id="validateReport" type="button" ${report.canValidate ? '' : 'disabled'}>Valider pour remise client</button>` : ''}</div></section>`;

    bindDetail(record);
  }
  function bindDetail(record) {
    $('assignSelf')?.addEventListener('click', () => mutate(`/api/workshop/interventions/${encodeURIComponent(record.id)}/assign`, { technician: state.user?.name, technicianId: state.user?.id }));
    $('startWork')?.addEventListener('click', () => work(record.actualStartAt ? 'resume' : 'start'));
    $('pauseWork')?.addEventListener('click', () => work('pause', { reason: 'Mise en attente depuis la procédure atelier', workstationReleased: true }));
    $('receptionForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await mutate(`/api/workshop/interventions/${encodeURIComponent(record.id)}/reception`, { mileage: form.get('mileage'), notes: form.get('notes'), clientReservations: form.get('clientReservations') });
    });
    document.querySelectorAll('[data-step]').forEach((row) => {
      const stepId = row.dataset.step;
      const note = row.querySelector('.step-note input:not([type=file])');
      const checked = row.querySelector('input[type=checkbox]').checked;
      row.querySelector('[data-toggle]').onclick = () => updateStep(stepId, !checked, note.value);
      row.querySelector('[data-save-note]').onclick = () => updateStep(stepId, checked, note.value);
      const file = row.querySelector('[data-file]');
      row.querySelector('[data-photo]').onclick = () => file.click();
      file.onchange = () => uploadEvidence(stepId, file.files?.[0], note.value);
    });
    $('requestFinal')?.addEventListener('click', () => mutate(`/api/workshop/interventions/${encodeURIComponent(record.id)}/request-final`, { finalNotes: $('finalNotes').value }));
    $('approveFinal')?.addEventListener('click', () => {
      if (!confirm('Confirmer la validation finale et terminer l’intervention ? Le rapport et la facture seront générés en brouillons à valider.')) return;
      mutate(`/api/workshop/interventions/${encodeURIComponent(record.id)}/approve-final`, { note: $('finalNotes').value });
    });
    $('generateReport')?.addEventListener('click', () => mutate(`/api/workshop/interventions/${encodeURIComponent(record.id)}/report`, {}));
    $('validateReport')?.addEventListener('click', () => {
      if (!confirm('Valider cette version complète pour remise au client ? Une nouvelle version horodatée sera conservée.')) return;
      mutate(`/api/workshop/interventions/${encodeURIComponent(record.id)}/report-validate`, { managerValidation: state.user?.name });
    });
  }
  async function mutate(url, body, method = 'POST') {
    try {
      await api(url, { method, body: JSON.stringify(body || {}) });
      toast('Dossier atelier mis à jour.');
      await loadOverview(true);
    } catch (error) {
      const details = error.missingFields?.length ? ` Éléments manquants : ${error.missingFields.join(' ; ')}` : '';
      toast(`${error.message}.${details}`, true);
    }
  }
  async function work(action, extras = {}) {
    await mutate(`/api/workshop/interventions/${encodeURIComponent(state.selectedId)}/work-action`, { action, ...extras });
  }
  async function updateStep(stepId, complete, note) {
    await mutate(`/api/workshop/interventions/${encodeURIComponent(state.selectedId)}/steps/${encodeURIComponent(stepId)}`, { complete, note }, 'PATCH');
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function uploadEvidence(stepId, file, note) {
    if (!file) return;
    try {
      toast('Ajout de la preuve photographique…');
      const dataUrl = await readFile(file);
      await api(`/api/workshop/interventions/${encodeURIComponent(state.selectedId)}/steps/${encodeURIComponent(stepId)}/evidence`, { method: 'POST', body: JSON.stringify({ dataUrl, fileName: file.name, title: file.name, note }) });
      toast('Photo ajoutée au dossier et à l’étape.');
      await loadOverview(true);
    } catch (error) { toast(`Photo : ${error.message}`, true); }
  }
  async function loadDetail(id) {
    try { renderDetail(await api(`/api/workshop/interventions/${encodeURIComponent(id)}`)); }
    catch (error) { toast(`Dossier : ${error.message}`, true); }
  }

  window.loadOverview = loadOverview;
  loadOverview(false);
})();
