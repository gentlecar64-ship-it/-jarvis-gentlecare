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
    packages: [],
    selectedClient: null,
    selectedVehicle: null,
    preview: null,
    priceConfirmed: false,
    currentQuote: null,
    recognition: null
  };

  const fieldIds = [
    'clientId', 'clientName', 'mobile', 'email', 'preferredChannel', 'address',
    'vehicleId', 'brand', 'model', 'trim', 'registration', 'year', 'color', 'mileage', 'vin', 'photoUrl', 'vehicleNotes',
    'packageKey', 'targetPrice', 'finalPrice', 'durationDays', 'service', 'tariffReason',
    'marketValueAverage', 'marketValueSource', 'currentConditionValue', 'currentValueSource',
    'postTreatmentValue', 'postTreatmentValueSource', 'clientEstimatedValue', 'expertCurrentValue',
    'expertPostTreatmentValue', 'expertName', 'expertReference', 'preWorkConditionNotes',
    'earliestDate', 'expertReviewStatus'
  ];

  function value(id) { return $(id)?.value ?? ''; }
  function numeric(id) { const result = Number(value(id)); return Number.isFinite(result) ? result : 0; }
  function set(id, next) { const element = $(id); if (element && next !== undefined && next !== null && next !== '') element.value = next; }
  function payload() {
    return {
      text: value('voiceText'),
      clientId: value('clientId'),
      clientName: value('clientName'),
      mobile: value('mobile'),
      email: value('email'),
      preferredChannel: value('preferredChannel'),
      address: value('address'),
      vehicleId: value('vehicleId'),
      brand: value('brand'),
      model: value('model'),
      trim: value('trim'),
      registration: value('registration'),
      year: value('year'),
      color: value('color'),
      mileage: numeric('mileage'),
      vin: value('vin'),
      photoUrl: value('photoUrl'),
      vehicleNotes: value('vehicleNotes'),
      notes: `${value('vehicleNotes')} ${value('preWorkConditionNotes')}`.trim(),
      packageKey: value('packageKey'),
      targetPrice: numeric('targetPrice'),
      customPrice: numeric('targetPrice'),
      finalPrice: numeric('finalPrice'),
      durationDays: numeric('durationDays') || 2,
      service: value('service'),
      tariffReason: value('tariffReason'),
      marketValueAverage: numeric('marketValueAverage'),
      marketValueSource: value('marketValueSource'),
      currentConditionValue: numeric('currentConditionValue'),
      currentValueSource: value('currentValueSource'),
      postTreatmentValue: numeric('postTreatmentValue'),
      postTreatmentValueSource: value('postTreatmentValueSource'),
      clientEstimatedValue: numeric('clientEstimatedValue'),
      expertCurrentValue: numeric('expertCurrentValue'),
      expertPostTreatmentValue: numeric('expertPostTreatmentValue'),
      expertName: value('expertName'),
      expertReference: value('expertReference'),
      preWorkConditionNotes: value('preWorkConditionNotes'),
      earliestDate: value('earliestDate'),
      expertReviewStatus: value('expertReviewStatus'),
      acceptInferredPackage: false
    };
  }

  function resetValidation() {
    state.priceConfirmed = false;
    $('createButton').disabled = true;
    $('createTop').disabled = true;
    $('priceCheck').classList.remove('show');
    updateMetrics();
  }

  function updateMetrics() {
    const required = ['clientName', 'brand', 'model'];
    const contactOk = Boolean(value('email') || value('mobile'));
    const price = numeric('finalPrice') || numeric('targetPrice') || state.packages.find((item) => item.key === value('packageKey'))?.totalTtc || 0;
    const complete = required.filter((id) => value(id)).length + (contactOk ? 1 : 0) + (price ? 1 : 0);
    $('completionMetric').textContent = `${Math.round(complete / 5 * 100)} %`;
    $('priceMetric').textContent = price ? `${price.toLocaleString('fr-FR')} €` : '—';
    const high = [numeric('marketValueAverage'), numeric('currentConditionValue'), numeric('postTreatmentValue'), numeric('clientEstimatedValue'), numeric('expertCurrentValue'), numeric('expertPostTreatmentValue')].some((amount) => amount > 50000);
    $('expertMetric').textContent = high || /À décider|Contact/i.test(value('expertReviewStatus')) ? 'Oui' : 'Non';
    $('planningMetric').textContent = $('planningPreview').textContent.includes('déterminer') ? 'Bloqué' : (state.preview ? 'Proposé' : '—');
  }

  function populatePackages() {
    const select = $('packageKey');
    select.innerHTML = '<option value="">Choisir ou saisir un prix</option>' + state.packages.map((item) => `<option value="${esc(item.key)}">${esc(item.label)} — ${Number(item.totalTtc).toLocaleString('fr-FR')} €</option>`).join('');
  }

  function onPackageChange() {
    const selected = state.packages.find((item) => item.key === value('packageKey'));
    if (selected) {
      set('targetPrice', selected.totalTtc);
      set('finalPrice', selected.totalTtc);
      set('durationDays', selected.durationDays || 2);
      set('service', selected.label);
      set('tariffReason', selected.tariffSource);
      $('packageInference').textContent = `Forfait sélectionné : ${selected.label}. Le prix devra encore être confirmé humainement.`;
    }
    resetValidation();
  }

  function applyParsed(parsed = {}) {
    const map = {
      name: 'clientName', clientName: 'clientName', email: 'email', mobile: 'mobile', phone: 'mobile', address: 'address', preferredChannel: 'preferredChannel',
      brand: 'brand', model: 'model', trim: 'trim', registration: 'registration', color: 'color', year: 'year', mileage: 'mileage', vin: 'vin',
      targetPrice: 'targetPrice', clientEstimatedValue: 'clientEstimatedValue'
    };
    for (const [source, target] of Object.entries(map)) if (parsed[source] !== undefined && parsed[source] !== '' && parsed[source] !== 0) set(target, parsed[source]);
    resetValidation();
    $('jarvisStatus').textContent = 'Jarvis a réparti les informations entendues dans le formulaire. Vérifiez chaque champ avant de prévisualiser.';
  }

  async function parseVoice() {
    const text = value('voiceText').trim();
    if (!text) return;
    $('jarvisStatus').textContent = 'Jarvis analyse la dictée…';
    try {
      const result = await api('/api/quote-studio/parse', { method: 'POST', body: JSON.stringify({ text }) });
      applyParsed(result.parsed || result);
    } catch (error) { $('jarvisStatus').textContent = `Analyse impossible : ${error.message}`; }
  }

  function startDictation() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      $('jarvisStatus').textContent = 'La dictée vocale n’est pas disponible dans ce navigateur. Utilisez le formulaire ou Chrome/Safari avec le microphone autorisé.';
      return;
    }
    if (state.recognition) {
      try { state.recognition.stop(); } catch {}
      state.recognition = null;
      return;
    }
    const recognition = new Recognition();
    state.recognition = recognition;
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => { $('dictateButton').textContent = '■ Arrêter la dictée'; $('jarvisStatus').textContent = 'Jarvis vous écoute…'; };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) transcript += `${event.results[index][0]?.transcript || ''} `;
      $('voiceText').value = transcript.trim();
    };
    recognition.onerror = (event) => { $('jarvisStatus').textContent = `Écoute interrompue : ${event.error}`; };
    recognition.onend = () => {
      state.recognition = null;
      $('dictateButton').textContent = '🎙 Démarrer la dictée';
      parseVoice();
    };
    try { recognition.start(); } catch (error) { $('jarvisStatus').textContent = error.message; }
  }

  async function lookup() {
    const query = value('lookupQuery').trim();
    if (!query) return;
    $('lookupResults').innerHTML = '<div class="muted">Recherche…</div>';
    try {
      const result = await api(`/api/quote-studio/lookup?q=${encodeURIComponent(query)}`);
      if (result.exactRegistration?.vehicle) {
        const owner = result.exactRegistration.client;
        $('lookupResults').innerHTML = `<div class="alert">Immatriculation trouvée : ${esc(result.exactRegistration.vehicle.registration)} — dossier ${esc(owner?.name || 'client inconnu')}.</div>`;
      } else $('lookupResults').innerHTML = '';
      $('lookupResults').insertAdjacentHTML('beforeend', (result.records || []).map((record, index) => `<div class="result-card"><strong>${esc(record.client.name || 'Client sans nom')}</strong><span class="muted">${esc(record.client.email || record.client.mobile || '')} · ${(record.vehicles || []).length} véhicule(s)</span><div class="result-actions"><button type="button" data-client-index="${index}">Ouvrir ce dossier</button></div></div>`).join('') || '<div class="muted">Aucun dossier trouvé. Vous pouvez créer un nouveau client.</div>');
      $('lookupResults').querySelectorAll('[data-client-index]').forEach((button) => button.onclick = () => selectClient((result.records || [])[Number(button.dataset.clientIndex)]));
    } catch (error) { $('lookupResults').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }

  function selectClient(record) {
    state.selectedClient = record.client;
    state.selectedVehicle = null;
    set('clientId', record.client.id);
    set('clientName', record.client.name);
    set('mobile', record.client.mobile || record.client.phone);
    set('email', record.client.email);
    set('preferredChannel', record.client.preferredChannel || 'E-mail');
    set('address', record.client.address);
    $('selectedDossier').innerHTML = `<strong>Dossier ouvert : ${esc(record.client.name)}</strong><div class="muted">Sélectionnez un véhicule connu ou ajoutez-en un nouveau. Aucun nombre maximal de véhicules n’est imposé.</div>`;
    $('knownVehicles').innerHTML = (record.vehicles || []).map((vehicle, index) => `<div class="result-card"><strong>${esc([vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Véhicule')}</strong><span class="muted">${esc([vehicle.year, vehicle.color, vehicle.registration].filter(Boolean).join(' · '))}</span><div class="result-actions"><button type="button" data-vehicle-index="${index}">Utiliser ce véhicule</button></div></div>`).join('') + '<div class="result-actions"><button type="button" id="addVehicleToClient">Ajouter un autre véhicule</button></div>';
    $('knownVehicles').querySelectorAll('[data-vehicle-index]').forEach((button) => button.onclick = () => selectVehicle((record.vehicles || [])[Number(button.dataset.vehicleIndex)]));
    $('addVehicleToClient').onclick = clearVehicle;
    resetValidation();
  }

  function selectVehicle(vehicle) {
    state.selectedVehicle = vehicle;
    set('vehicleId', vehicle.id);
    set('brand', vehicle.brand);
    set('model', vehicle.model);
    set('trim', vehicle.trim || vehicle.series);
    set('registration', vehicle.registration);
    set('year', vehicle.year);
    set('color', vehicle.color);
    set('mileage', vehicle.mileage);
    set('vin', vehicle.vin);
    set('photoUrl', vehicle.photoUrl);
    set('vehicleNotes', vehicle.notes);
    resetValidation();
  }

  function clearVehicle() {
    state.selectedVehicle = null;
    ['vehicleId', 'brand', 'model', 'trim', 'registration', 'year', 'color', 'mileage', 'vin', 'photoUrl', 'vehicleNotes'].forEach((id) => { $(id).value = ''; });
    resetValidation();
  }

  function newDossier() {
    state.selectedClient = null;
    state.selectedVehicle = null;
    ['clientId', 'clientName', 'mobile', 'email', 'address', 'vehicleId', 'brand', 'model', 'trim', 'registration', 'year', 'color', 'mileage', 'vin', 'photoUrl', 'vehicleNotes'].forEach((id) => { $(id).value = ''; });
    $('knownVehicles').innerHTML = '';
    $('selectedDossier').textContent = 'Nouveau dossier : la fiche client et le véhicule seront créés seulement après validation du devis.';
    resetValidation();
  }

  function renderInference(inference = {}) {
    const selected = inference.selected;
    let html = `<strong>${esc(inference.message || '')}</strong>`;
    if (selected) html += `<div class="muted">Proposition : ${esc(selected.label)} — ${Number(selected.totalTtc).toLocaleString('fr-FR')} € — confiance ${Math.round(Number(inference.confidence || 0) * 100)} %.</div>`;
    if (inference.status === 'ambiguous') html += `<div class="result-actions">${(inference.candidates || []).map((candidate) => `<button type="button" data-inference-key="${esc(candidate.key)}">${esc(candidate.label)} — ${Number(candidate.totalTtc).toLocaleString('fr-FR')} €</button>`).join('')}</div>`;
    $('packageInference').innerHTML = html;
    $('packageInference').querySelectorAll('[data-inference-key]').forEach((button) => button.onclick = () => {
      $('packageKey').value = button.dataset.inferenceKey;
      onPackageChange();
    });
  }

  async function inferPrice() {
    const targetPrice = numeric('targetPrice') || numeric('finalPrice');
    if (!targetPrice) {
      $('packageInference').textContent = 'Indiquez le tarif annoncé.';
      return;
    }
    try {
      const result = await api('/api/quote-studio/infer', { method: 'POST', body: JSON.stringify({ targetPrice, context: `${value('service')} ${value('tariffReason')} ${value('voiceText')}` }) });
      renderInference(result.inference || result);
      if (result.inference?.selected && result.inference.status !== 'ambiguous') {
        $('packageKey').value = result.inference.selected.key;
        set('finalPrice', targetPrice);
        set('service', result.inference.selected.label);
        set('tariffReason', result.inference.selected.tariffSource);
      }
    } catch (error) { $('packageInference').textContent = error.message; }
  }

  function renderPreview(result) {
    state.preview = result;
    state.priceConfirmed = false;
    $('quotePreview').textContent = result.quoteText || '';
    const warnings = result.data?.warnings || [];
    $('previewWarnings').innerHTML = warnings.map((warning) => `<div class="alert ${/immatriculation/i.test(warning) ? 'bad' : ''}">${esc(warning)}</div>`).join('');
    const valuation = result.data?.valuation || {};
    if (valuation.expertReviewRequired) {
      $('valuationAlert').innerHTML = `<div class="alert">Alerte humaine : ${valuation.isHighValue ? 'valeur supérieure à 50 000 € ; ' : ''}${valuation.isRareVehicle ? 'rareté potentielle ; ' : ''}aucune date ferme ne doit être annoncée avant décision.</div>`;
      $('expertReviewStatus').value = valuation.expertReviewStatus || 'À décider par David / Bénédicte';
    } else $('valuationAlert').innerHTML = `<div class="alert success">Aucune alerte automatique de valeur élevée ou de rareté sur les informations saisies.</div>`;
    const schedule = result.data?.schedule;
    $('planningPreview').innerHTML = schedule?.blocked
      ? '<strong>Date à déterminer.</strong><div class="muted">Le client sera recontacté après la décision d’expertise.</div>'
      : `<strong>Inspection : ${esc(schedule?.inspection?.date || 'à confirmer')} à ${esc(schedule?.inspection?.time || '')}</strong><div class="muted">Intervention : ${esc(schedule?.intervention?.startDate || '')} → ${esc(schedule?.intervention?.endDate || '')} · livraison ${esc(schedule?.intervention?.deliveryDate || '')} à ${esc(schedule?.intervention?.deliveryTime || '')}</div>`;
    renderInference(result.data?.package?.inference || {});
    $('priceCheckText').textContent = `Prix proposé : ${Number(result.data?.package?.totalTtc || 0).toLocaleString('fr-FR')} € TTC pour « ${result.data?.package?.label || 'prestation à définir'} ».`;
    $('priceCheck').classList.add('show');
    $('createButton').disabled = true;
    $('createTop').disabled = true;
    updateMetrics();
  }

  async function preview() {
    $('quotePreview').textContent = 'Jarvis contrôle le dossier, les doublons, le tarif, les valeurs et le planning…';
    try {
      const result = await api('/api/quote-studio/preview', { method: 'POST', body: JSON.stringify(payload()) });
      renderPreview(result);
    } catch (error) {
      $('quotePreview').textContent = `Prévisualisation impossible : ${error.message}`;
      $('previewWarnings').innerHTML = error.missingFields ? `<div class="alert bad">Champs manquants : ${esc(error.missingFields.join(', '))}</div>` : '';
    }
  }

  function confirmPrice() {
    if (!state.preview) return;
    state.priceConfirmed = true;
    $('priceCheck').classList.remove('show');
    $('createButton').disabled = !state.preview.canCreate;
    $('createTop').disabled = !state.preview.canCreate;
    $('packageInference').insertAdjacentHTML('beforeend', '<div class="alert success">Prix confirmé humainement pour la création de ce devis.</div>');
  }

  async function rejectPrice() {
    state.priceConfirmed = false;
    $('createButton').disabled = true;
    $('createTop').disabled = true;
    await inferPrice();
    $('priceCheck').classList.remove('show');
    $('packageInference').insertAdjacentHTML('beforeend', '<div class="alert">Choisissez le forfait proposé ou saisissez un prix final et un motif, puis relancez la prévisualisation.</div>');
  }

  async function createQuote() {
    if (!state.preview || !state.priceConfirmed) return;
    $('creationResult').innerHTML = '<div class="status">Création du dossier, du devis texte, du devis visuel et du brouillon d’e-mail…</div>';
    try {
      const result = await api('/api/quote-studio/confirm', { method: 'POST', body: JSON.stringify({ ...payload(), humanConfirmed: true, priceConfirmed: true, acceptInferredPackage: true }) });
      state.currentQuote = result.quote;
      $('creationResult').innerHTML = `<div class="alert success"><strong>Devis ${esc(result.quote.number)} créé.</strong><div>Le texte et le visuel sont bloqués avant envoi.</div><div class="actions"><a class="button primary" href="${esc(result.visualUrl)}" target="_blank" rel="noopener">Ouvrir le devis visuel</a><button type="button" id="copyQuoteText">Copier le texte exact</button><a class="button" href="/planning">Ouvrir le planning</a></div></div>`;
      $('copyQuoteText').onclick = () => navigator.clipboard?.writeText(result.quoteText || '').then(() => { $('jarvisStatus').textContent = 'Texte exact du devis copié.'; });
      $('contactExpertButton').classList.toggle('hidden', !result.quote.expertReviewRequired);
      await loadRecentQuotes();
    } catch (error) {
      $('creationResult').innerHTML = `<div class="alert bad">${esc(error.message)}${error.missingFields ? ` — ${esc(error.missingFields.join(', '))}` : ''}</div>`;
    }
  }

  async function contactExpert(quoteId = state.currentQuote?.id) {
    if (!quoteId) return;
    const reason = window.prompt('Motif à transmettre dans la tâche expert :', 'Valeur élevée ou rareté potentielle à confirmer avant planification.');
    if (reason === null) return;
    try {
      const result = await api(`/api/quote-studio/${encodeURIComponent(quoteId)}/expert-contact`, { method: 'POST', body: JSON.stringify({ reason, assignee: 'David' }) });
      $('creationResult').insertAdjacentHTML('beforeend', `<div class="alert success">Tâche « Contacter l’expert » et brouillon interne créés. Aucun message n’a été envoyé.</div>`);
      state.currentQuote = result.quote;
      await loadRecentQuotes();
    } catch (error) { $('creationResult').insertAdjacentHTML('beforeend', `<div class="alert bad">${esc(error.message)}</div>`); }
  }

  async function loadRecentQuotes() {
    try {
      const result = await api('/api/quote-studio/quotes');
      $('recentQuotes').innerHTML = (result.records || []).slice(0, 20).map((quote) => `<div class="result-card"><strong>${esc(quote.number)} — ${esc(quote.clientName || 'Client')} — ${esc(quote.vehicleLabel || '')}</strong><span class="muted">${esc(quote.service || '')} · ${Number(quote.totalTtc || 0).toLocaleString('fr-FR')} € · ${esc(quote.status || '')} · ${esc(quote.planningStatus || '')}</span><div class="result-actions">${quote.visualUrl ? `<a class="button" href="${esc(quote.visualUrl)}" target="_blank" rel="noopener">Visuel</a>` : ''}<a class="button" href="/planning?quote=${encodeURIComponent(quote.id)}">Planifier</a>${quote.expertReviewRequired && quote.expertReviewStatus !== 'Approuvée' ? `<button type="button" data-expert-quote="${esc(quote.id)}">Contacter l’expert</button>` : ''}</div></div>`).join('') || '<div class="muted">Aucun devis enregistré.</div>';
      $('recentQuotes').querySelectorAll('[data-expert-quote]').forEach((button) => button.onclick = () => contactExpert(button.dataset.expertQuote));
    } catch (error) { $('recentQuotes').innerHTML = `<div class="alert bad">${esc(error.message)}</div>`; }
  }

  async function init() {
    try {
      const result = await api('/api/quote-studio/packages');
      state.packages = result.records || [];
      populatePackages();
    } catch (error) { $('packageInference').textContent = error.message; }
    const today = new Date().toISOString().slice(0, 10);
    $('earliestDate').value = today;
    fieldIds.forEach((id) => $(id)?.addEventListener('input', () => { if (id !== 'lookupQuery') resetValidation(); updateMetrics(); }));
    $('packageKey').addEventListener('change', onPackageChange);
    $('targetPrice').addEventListener('change', inferPrice);
    $('dictateButton').onclick = startDictation;
    $('voiceText').addEventListener('change', parseVoice);
    $('lookupButton').onclick = lookup;
    $('lookupQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); lookup(); } });
    $('newDossierButton').onclick = newDossier;
    $('previewButton').onclick = preview;
    $('previewTop').onclick = preview;
    $('priceYes').onclick = confirmPrice;
    $('priceNo').onclick = rejectPrice;
    $('createButton').onclick = createQuote;
    $('createTop').onclick = createQuote;
    $('contactExpertButton').onclick = () => contactExpert();
    await loadRecentQuotes();
    updateMetrics();
  }

  init();
})();
