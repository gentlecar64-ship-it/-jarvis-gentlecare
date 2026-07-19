(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers:{ 'Content-Type':'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Erreur ${response.status}`); Object.assign(error, data); throw error; }
    return data;
  };
  const state = {
    packages:[], procedures:[], me:null, isDirection:false, selectedClient:null, selectedVehicle:null,
    preview:null, priceConfirmed:false, currentQuote:null, recognition:null, requestId:'', dirty:false,
    acquired:false, saveTimer:null, saving:false, allowLeave:false, specialOfferEnabled:false
  };
  const categoryFallbackLabels = { voiture:'Voiture', moto:'Moto / deux-roues', utilitaire:'Utilitaire', camion:'Camion / poids lourd', avion:'Avion', helicoptere:'Hélicoptère', industriel:'Devis industriel', autre:'Autre' };
  const fieldIds = [
    'clientId','clientName','mobile','email','preferredChannel','address','vehicleId','vehicleType','customerType','brand','model','trim','registration','year','color','mileage','vin','photoUrl','vehicleNotes',
    'packageKey','targetPrice','finalPrice','durationDays','service','tariffReason','specialOfferName','standardPriceTtc','discountPercent','discountAmountTtc','directCostTtc','targetMarginPercent',
    'marketValueAverage','marketValueSource','currentConditionValue','currentValueSource','postTreatmentValue','postTreatmentValueSource','clientEstimatedValue','expertCurrentValue','expertPostTreatmentValue','expertName','expertReference','preWorkConditionNotes','earliestDate','expertReviewStatus','voiceText'
  ];

  function value(id) { return $(id)?.value ?? ''; }
  function numeric(id) { const result = Number(String(value(id)).replace(',', '.')); return Number.isFinite(result) ? result : 0; }
  function set(id, next, force = false) { const element = $(id); if (element && (force || (next !== undefined && next !== null && next !== ''))) element.value = next ?? ''; }
  function packageByKey(key = value('packageKey')) { return state.packages.find((item) => item.key === key || item.id === key) || null; }
  function categoryLabel(key) { return state.procedures.find((item) => item.requestCategory === key || item.vehicleType === key)?.categoryLabel || categoryFallbackLabels[key] || 'À définir'; }
  function procedureFor(category = value('vehicleType')) { return state.procedures.find((item) => item.requestCategory === category || item.vehicleType === category) || null; }
  function meaningful() { return ['vehicleType','clientName','mobile','email','brand','model','registration','voiceText','vehicleNotes','service','targetPrice','finalPrice'].some((id) => String(value(id)).trim()); }
  function payload() {
    const selected = packageByKey();
    const category = value('vehicleType');
    const procedure = procedureFor(category);
    return {
      requestId:state.requestId, text:value('voiceText'), voiceText:value('voiceText'), source:'Page Demandes et Devis',
      clientId:value('clientId'), clientName:value('clientName'), mobile:value('mobile'), email:value('email'), preferredChannel:value('preferredChannel'), address:value('address'),
      vehicleId:value('vehicleId'), requestCategory:category, vehicleType:category, customerType:value('customerType') || 'particulier', brand:value('brand'), model:value('model'), trim:value('trim'), registration:value('registration'), year:value('year'), color:value('color'), mileage:numeric('mileage'), vin:value('vin'), photoUrl:value('photoUrl'), vehicleNotes:value('vehicleNotes'), notes:`${value('vehicleNotes')} ${value('preWorkConditionNotes')}`.trim(),
      tariffKey:value('packageKey'), packageKey:value('packageKey'), targetPrice:numeric('targetPrice'), customPrice:numeric('finalPrice') || numeric('targetPrice'), finalPrice:numeric('finalPrice'), durationDays:numeric('durationDays') || procedure?.defaultDurationDays || 1, service:value('service') || selected?.label || '', tariffReason:value('tariffReason') || selected?.tariffSource || '',
      specialOfferEnabled:state.specialOfferEnabled, specialOfferName:value('specialOfferName'), standardPriceTtc:numeric('standardPriceTtc'), discountPercent:numeric('discountPercent'), discountAmountTtc:numeric('discountAmountTtc'), directCostTtc:numeric('directCostTtc'), targetMarginPercent:numeric('targetMarginPercent'),
      marketValueAverage:numeric('marketValueAverage'), marketValueSource:value('marketValueSource'), currentConditionValue:numeric('currentConditionValue'), currentValueSource:value('currentValueSource'), postTreatmentValue:numeric('postTreatmentValue'), postTreatmentValueSource:value('postTreatmentValueSource'), clientEstimatedValue:numeric('clientEstimatedValue'), expertCurrentValue:numeric('expertCurrentValue'), expertPostTreatmentValue:numeric('expertPostTreatmentValue'), expertName:value('expertName'), expertReference:value('expertReference'), preWorkConditionNotes:value('preWorkConditionNotes'), earliestDate:value('earliestDate'), expertReviewStatus:value('expertReviewStatus'), acceptInferredPackage:false
    };
  }
  function setSaveStatus(message, saved = false) { $('autoSaveStatus').textContent = message; $('saveDot').classList.toggle('saved', saved); }
  function resetValidation() { state.priceConfirmed = false; $('createButton').disabled = true; $('createTop').disabled = true; $('priceCheck').classList.remove('show'); }
  function updateCategoryButtons() { document.querySelectorAll('[data-category]').forEach((button) => button.classList.toggle('selected', button.dataset.category === value('vehicleType'))); }
  function updateMetrics() {
    const price = numeric('finalPrice') || numeric('targetPrice') || packageByKey()?.totalTtc || 0;
    const checks = [Boolean(value('vehicleType')), Boolean(value('clientName')), Boolean(value('email') || value('mobile')), Boolean(value('brand')), Boolean(value('model')), Boolean(price)];
    $('completionMetric').textContent = `${Math.round(checks.filter(Boolean).length / checks.length * 100)} %`;
    $('priceMetric').textContent = price ? `${price.toLocaleString('fr-FR')} €` : '—';
    const high = [numeric('marketValueAverage'),numeric('currentConditionValue'),numeric('postTreatmentValue'),numeric('clientEstimatedValue'),numeric('expertCurrentValue'),numeric('expertPostTreatmentValue')].some((amount) => amount > 50000);
    $('expertMetric').textContent = high || /À décider|Contact/i.test(value('expertReviewStatus')) ? 'Oui' : 'Non';
    $('planningMetric').textContent = $('planningPreview').textContent.includes('déterminer') ? 'Bloqué' : (state.preview ? 'Proposé' : '—');
  }
  function markChanged() {
    state.dirty = true; state.acquired = meaningful(); resetValidation(); updateMetrics(); updateCategoryButtons(); setSaveStatus('Modifications à enregistrer', false);
    clearTimeout(state.saveTimer); if (state.acquired) state.saveTimer = setTimeout(() => saveDraft(true), 850);
  }
  function applyRole() {
    state.isDirection = ['admin','associate'].includes(state.me?.role);
    document.body.classList.toggle('direction', state.isDirection);
    $('roleMode').textContent = state.isDirection ? 'Direction — demande et création de devis' : 'Employé — demande soumise à validation';
  }
  function populatePackages() {
    const select = $('packageKey');
    const categoryOrder = ['voiture','moto','utilitaire','camion','avion','helicoptere','industriel','autre'];
    select.innerHTML = '<option value="">Choisir un tarif</option>' + categoryOrder.map((category) => {
      const records = state.packages.filter((item) => item.vehicleType === category);
      if (!records.length) return '';
      return `<optgroup label="${esc(categoryLabel(category))}">${records.map((item) => `<option value="${esc(item.key)}">${esc(item.label)} — ${esc(item.displayPrice || (item.totalTtc ? `${Number(item.totalTtc).toLocaleString('fr-FR')} € TTC` : 'prix direction'))}</option>`).join('')}</optgroup>`;
    }).join('');
  }
  function renderProcedure() {
    const procedure = procedureFor();
    if (!procedure) { $('procedureHeader').innerHTML = '<strong>Jarvis : de quoi s’agit-il ?</strong><div class="muted">Choisissez la catégorie avant toute proposition.</div>'; $('procedureList').innerHTML = ''; return; }
    $('procedureHeader').innerHTML = `<strong>${esc(procedure.label)}</strong><div class="muted">Version ${esc(procedure.version)} · durée de référence ${esc(procedure.defaultDurationDays || 1)} jour(s) ouvré(s).</div>`;
    $('procedureList').innerHTML = (procedure.checklist || []).map((item) => `<li>${esc(item)}</li>`).join('');
  }
  function chooseCategory(category, source = 'bouton') {
    if (!category) return;
    set('vehicleType', category, true);
    const procedure = procedureFor(category);
    set('durationDays', procedure?.defaultDurationDays || 1, true);
    const selected = packageByKey();
    if (selected && selected.vehicleType !== category) set('packageKey', '', true);
    updateCategoryButtons(); renderProcedure(); calculateMargin();
    $('jarvisStatus').textContent = `Nature sélectionnée : ${categoryLabel(category)}. Jarvis utilise maintenant la procédure adaptée.`;
    if (source !== 'load') markChanged(); else updateMetrics();
  }
  function selectContextPackage() {
    const category = value('vehicleType'); const customerType = value('customerType'); const selected = packageByKey();
    if (selected && (selected.vehicleType !== category || (selected.customerType !== 'tous' && selected.customerType !== customerType))) set('packageKey','',true);
    updateCategoryButtons(); renderProcedure(); calculateMargin();
  }
  function onPackageChange() {
    const selected = packageByKey();
    if (selected) {
      chooseCategory(selected.vehicleType, 'load');
      if (selected.customerType !== 'tous') set('customerType', selected.customerType, true);
      set('durationDays', selected.durationDays || procedureFor(selected.vehicleType)?.defaultDurationDays || 1, true);
      set('service', selected.label, true); set('tariffReason', selected.tariffSource, true);
      if (selected.totalTtc > 0) { set('targetPrice',selected.totalTtc,true); set('finalPrice',selected.totalTtc,true); set('standardPriceTtc',selected.totalTtc,true); }
      else { set('targetPrice','',true); set('finalPrice','',true); set('standardPriceTtc','',true); }
      $('packageInference').textContent = selected.requiresDirectionPrice ? `${selected.label} : le montant final doit être fixé par la direction.` : `Tarif sélectionné : ${selected.label}. Le prix doit encore être confirmé humainement.`;
    }
    renderProcedure(); calculateMargin(); markChanged();
  }
  function toggleSpecialOffer() {
    if (!state.isDirection) return;
    state.specialOfferEnabled = !state.specialOfferEnabled;
    $('specialOfferPanel').classList.toggle('show', state.specialOfferEnabled);
    $('specialOfferButton').textContent = state.specialOfferEnabled ? '★ Fermer l’offre spéciale' : '★ Offre spéciale';
    if (state.specialOfferEnabled && !numeric('standardPriceTtc')) set('standardPriceTtc', packageByKey()?.totalTtc || numeric('targetPrice') || numeric('finalPrice'), true);
    calculateMargin(); markChanged();
  }
  function calculateMargin(changedId = '') {
    if (!state.specialOfferEnabled) { $('marginStatus').textContent = 'Activez Offre spéciale pour calculer la remise et surveiller la marge.'; return; }
    const standard = numeric('standardPriceTtc'); let finalPrice = numeric('finalPrice'); let percent = numeric('discountPercent'); let amount = numeric('discountAmountTtc');
    if (changedId === 'discountPercent' && standard) { amount = standard * percent / 100; finalPrice = Math.max(0,standard-amount); set('discountAmountTtc',amount.toFixed(2),true); set('finalPrice',finalPrice.toFixed(2),true); }
    else if (changedId === 'discountAmountTtc' && standard) { finalPrice = Math.max(0,standard-amount); percent = standard ? amount / standard * 100 : 0; set('discountPercent',percent.toFixed(2),true); set('finalPrice',finalPrice.toFixed(2),true); }
    else if ((changedId === 'finalPrice' || !amount) && standard && finalPrice) { amount = Math.max(0,standard-finalPrice); percent = standard ? amount / standard * 100 : 0; set('discountAmountTtc',amount.toFixed(2),true); set('discountPercent',percent.toFixed(2),true); }
    const cost = numeric('directCostTtc'); const gross = finalPrice - cost; const marginPercent = finalPrice ? gross / finalPrice * 100 : 0; const target = numeric('targetMarginPercent'); const warnings = [];
    if (!cost) warnings.push('Coût direct non renseigné : marge non fiable.'); if (cost && gross < 0) warnings.push('Prix inférieur au coût direct.'); if (target && marginPercent < target) warnings.push(`Marge sous l’objectif de ${target.toFixed(1)} %.`);
    $('marginStatus').innerHTML = `<strong>Remise : ${percent.toFixed(1)} % — ${amount.toLocaleString('fr-FR',{maximumFractionDigits:2})} €</strong><div>Marge brute estimée : ${cost ? `${gross.toLocaleString('fr-FR',{maximumFractionDigits:2})} € — ${marginPercent.toFixed(1)} %` : 'à compléter'}</div>${warnings.length ? `<div class="alert bad">${esc(warnings.join(' '))}</div>` : '<div class="alert success">Aucune alerte de marge avec les données saisies.</div>'}`;
  }
  function detectCategory(text) {
    const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    for (const procedure of state.procedures) if ((procedure.aliases || []).some((alias) => normalized.includes(String(alias).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))) return procedure.requestCategory || procedure.vehicleType;
    return '';
  }
  function applyParsed(parsed = {}, originalText = '') {
    const spokenCategory = parsed.requestCategory || detectCategory(originalText);
    if (spokenCategory) chooseCategory(spokenCategory, 'load');
    const map = { name:'clientName',clientName:'clientName',email:'email',mobile:'mobile',phone:'mobile',address:'address',preferredChannel:'preferredChannel',brand:'brand',model:'model',trim:'trim',registration:'registration',color:'color',year:'year',mileage:'mileage',vin:'vin',targetPrice:'targetPrice',clientEstimatedValue:'clientEstimatedValue',customerType:'customerType' };
    for (const [source,target] of Object.entries(map)) if (parsed[source] !== undefined && parsed[source] !== '' && parsed[source] !== 0) set(target,parsed[source],true);
    renderProcedure(); markChanged();
    $('jarvisStatus').textContent = spokenCategory ? `Jarvis a identifié : ${categoryLabel(spokenCategory)}. Les informations entendues sont enregistrées.` : 'Jarvis a réparti les informations, mais il attend encore la nature exacte de la demande.';
  }
  async function parseVoice() {
    const text = value('voiceText').trim(); if (!text) return;
    $('jarvisStatus').textContent = 'Jarvis analyse la dictée…';
    try { const result = await api('/api/quote-studio/parse',{method:'POST',body:JSON.stringify({text})}); applyParsed(result.parsed || result,text); }
    catch (error) { $('jarvisStatus').textContent = `Analyse impossible : ${error.message}`; }
  }
  function startDictation() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { $('jarvisStatus').textContent = 'Dictée indisponible dans ce navigateur.'; return; }
    if (state.recognition) { try { state.recognition.stop(); } catch {} state.recognition = null; return; }
    const recognition = new Recognition(); state.recognition = recognition; recognition.lang='fr-FR'; recognition.continuous=false; recognition.interimResults=true;
    recognition.onstart = () => { $('dictateButton').textContent='■ Arrêter la dictée'; $('jarvisStatus').textContent='Jarvis vous écoute. Commencez par voiture, moto, utilitaire, camion, avion, hélicoptère, industriel ou autre.'; };
    recognition.onresult = (event) => { let transcript=''; for (let index=0; index<event.results.length; index+=1) transcript += `${event.results[index][0]?.transcript || ''} `; $('voiceText').value=transcript.trim(); state.acquired=true; };
    recognition.onerror = (event) => { $('jarvisStatus').textContent=`Écoute interrompue : ${event.error}`; };
    recognition.onend = () => { state.recognition=null; $('dictateButton').textContent='🎙 Démarrer la dictée'; parseVoice(); };
    try { recognition.start(); } catch (error) { $('jarvisStatus').textContent=error.message; }
  }

  async function lookup() {
    const query=value('lookupQuery').trim(); if (!query) return; $('lookupResults').innerHTML='<div class="muted">Recherche…</div>';
    try {
      const result=await api(`/api/quote-studio/lookup?q=${encodeURIComponent(query)}`);
      $('lookupResults').innerHTML=result.exactRegistration?.vehicle ? `<div class="alert">Référence trouvée : ${esc(result.exactRegistration.vehicle.registration)} — dossier ${esc(result.exactRegistration.client?.name || 'client inconnu')}.</div>` : '';
      $('lookupResults').insertAdjacentHTML('beforeend',(result.records || []).map((record,index)=>`<div class="result-card"><strong>${esc(record.client.name || 'Client sans nom')}</strong><span class="muted">${esc(record.client.email || record.client.mobile || '')} · ${(record.vehicles || []).length} dossier(s)</span><div class="result-actions"><button type="button" data-client-index="${index}">Ouvrir ce dossier</button></div></div>`).join('') || '<div class="muted">Aucun dossier trouvé. Les nouvelles informations seront conservées.</div>');
      $('lookupResults').querySelectorAll('[data-client-index]').forEach((button)=>button.onclick=()=>selectClient((result.records || [])[Number(button.dataset.clientIndex)]));
    } catch(error) { $('lookupResults').innerHTML=`<div class="alert bad">${esc(error.message)}</div>`; }
  }
  function selectClient(record) {
    state.selectedClient=record.client; state.selectedVehicle=null; set('clientId',record.client.id,true); set('clientName',record.client.name,true); set('mobile',record.client.mobile || record.client.phone,true); set('email',record.client.email,true); set('preferredChannel',record.client.preferredChannel || 'E-mail',true); set('address',record.client.address,true);
    $('selectedDossier').innerHTML=`<strong>Dossier ouvert : ${esc(record.client.name)}</strong><div class="muted">Sélectionnez un élément connu ou ajoutez-en un nouveau.</div>`;
    $('knownVehicles').innerHTML=(record.vehicles || []).map((item,index)=>{ const category=item.requestCategory || item.vehicleType || ''; return `<div class="result-card"><strong>${esc([item.brand,item.model].filter(Boolean).join(' ') || 'Élément')}</strong><span class="muted">${esc([categoryLabel(category),item.year,item.color,item.registration].filter(Boolean).join(' · '))}</span><div class="result-actions"><button type="button" data-vehicle-index="${index}">Utiliser ce dossier</button></div></div>`; }).join('') + '<div class="result-actions"><button type="button" id="addVehicleToClient">Ajouter un autre élément</button></div>';
    $('knownVehicles').querySelectorAll('[data-vehicle-index]').forEach((button)=>button.onclick=()=>selectVehicle((record.vehicles || [])[Number(button.dataset.vehicleIndex)])); $('addVehicleToClient').onclick=clearVehicle; markChanged();
  }
  function selectVehicle(item) {
    state.selectedVehicle=item; set('vehicleId',item.id,true); chooseCategory(item.requestCategory || item.vehicleType || 'autre','load'); set('brand',item.brand,true); set('model',item.model,true); set('trim',item.trim || item.series,true); set('registration',item.registration,true); set('year',item.year,true); set('color',item.color,true); set('mileage',item.mileage,true); set('vin',item.vin,true); set('photoUrl',item.photoUrl,true); set('vehicleNotes',item.notes,true); renderProcedure(); markChanged();
  }
  function clearVehicle() { state.selectedVehicle=null; ['vehicleId','brand','model','trim','registration','year','color','mileage','vin','photoUrl','vehicleNotes'].forEach((id)=>set(id,'',true)); set('vehicleType','',true); updateCategoryButtons(); renderProcedure(); markChanged(); }
  function newDossier() { state.selectedClient=null; state.selectedVehicle=null; state.requestId=''; fieldIds.forEach((id)=>{ if (!['preferredChannel','customerType','durationDays','expertReviewStatus','earliestDate'].includes(id)) set(id,'',true); }); set('vehicleType','',true); set('durationDays','1',true); $('knownVehicles').innerHTML=''; $('selectedDossier').textContent='Nouveau dossier : chaque information saisie sera enregistrée automatiquement, même sans devis validé.'; state.dirty=false; state.acquired=false; updateCategoryButtons(); renderProcedure(); setSaveStatus('Nouvelle demande vide',false); resetValidation(); updateMetrics(); $('jarvisStatus').textContent='Jarvis : de quoi s’agit-il ?'; }

  async function saveDraft(silent=false) {
    clearTimeout(state.saveTimer); if (!meaningful() || state.saving) return null; state.saving=true; if (!silent) setSaveStatus('Enregistrement…',false);
    try { const result=await api('/api/quote-requests/draft',{method:'POST',body:JSON.stringify(payload())}); state.requestId=result.request.id; set('clientId',result.client?.id || value('clientId'),true); set('vehicleId',result.vehicle?.id || value('vehicleId'),true); state.dirty=false; state.acquired=true; setSaveStatus(`Demande ${result.request.number} enregistrée`,true); return result; }
    catch(error) { setSaveStatus(`Erreur : ${error.message}`,false); if (!silent) $('creationResult').innerHTML=`<div class="alert bad">${esc(error.message)}</div>`; return null; }
    finally { state.saving=false; }
  }
  function categoryRequiredMessage() { $('creationResult').innerHTML='<div class="alert bad"><strong>Jarvis : de quoi s’agit-il ?</strong><div>Choisissez voiture, moto, utilitaire, camion, avion, hélicoptère, devis industriel ou autre.</div></div>'; document.querySelector('.category-question')?.scrollIntoView({behavior:'smooth',block:'center'}); }
  async function submitRequest() {
    if (!value('vehicleType')) return categoryRequiredMessage();
    if (!meaningful()) { $('creationResult').innerHTML='<div class="alert bad">Saisissez au moins une information utile.</div>'; return; }
    $('creationResult').innerHTML='<div class="status">Jarvis enregistre, analyse la catégorie et prépare sa proposition…</div>';
    try { const result=await api('/api/quote-requests/submit',{method:'POST',body:JSON.stringify(payload())}); state.requestId=result.request.id; state.dirty=false; state.acquired=true; setSaveStatus(`Demande ${result.request.number} envoyée`,true); renderPreview(result.proposal,true); $('creationResult').innerHTML=`<div class="alert success"><strong>Demande ${esc(result.request.number)} transmise.</strong><div>Nature : ${esc(categoryLabel(result.request.requestCategory || result.request.vehicleType))}. David ou Bénédicte doivent contrôler la procédure, le tarif, la marge et le planning.</div></div>`; await loadRequests(); }
    catch(error) { $('creationResult').innerHTML=`<div class="alert bad">${esc(error.message)}${error.missingFields ? ` — ${esc(error.missingFields.join(', '))}` : ''}</div>`; }
  }
  function renderInference(inference={}) { const selected=inference.selected; let html=`<strong>${esc(inference.message || '')}</strong>`; if (selected) html += `<div class="muted">Proposition : ${esc(selected.label)} — ${Number(selected.totalTtc || 0).toLocaleString('fr-FR')} € — confiance ${Math.round(Number(inference.confidence || 0)*100)} %.</div>`; if (inference.status==='ambiguous') html += `<div class="result-actions">${(inference.candidates || []).map((candidate)=>`<button type="button" data-inference-key="${esc(candidate.key)}">${esc(candidate.label)} — ${Number(candidate.totalTtc || 0).toLocaleString('fr-FR')} €</button>`).join('')}</div>`; $('packageInference').innerHTML=html; $('packageInference').querySelectorAll('[data-inference-key]').forEach((button)=>button.onclick=()=>{ $('packageKey').value=button.dataset.inferenceKey; onPackageChange(); }); }
  async function inferPrice() { const targetPrice=numeric('targetPrice') || numeric('finalPrice'); if (!targetPrice) { $('packageInference').textContent='Indiquez le tarif annoncé ou choisissez un tarif.'; return; } try { const result=await api('/api/quote-studio/infer',{method:'POST',body:JSON.stringify({targetPrice,context:`${value('service')} ${value('tariffReason')} ${value('vehicleType')} ${value('customerType')} ${value('voiceText')}`})}); renderInference(result.inference || result); } catch(error) { $('packageInference').textContent=error.message; } }
  function renderPreview(result,fromRequest=false) {
    state.preview=result; state.priceConfirmed=false; $('quotePreview').textContent=result?.quoteText || result?.jarvisQuoteText || 'Aucune proposition.';
    const warnings=result?.data?.warnings || []; $('previewWarnings').innerHTML=warnings.map((warning)=>`<div class="alert ${/immatriculation|nature de la demande/i.test(warning) ? 'bad' : ''}">${esc(warning)}</div>`).join('');
    const valuation=result?.data?.valuation || {}; if (valuation.expertReviewRequired) { $('valuationAlert').innerHTML=`<div class="alert">Alerte humaine : ${valuation.isHighValue ? 'valeur supérieure à 50 000 € ; ' : ''}${valuation.isRareVehicle ? 'rareté potentielle ; ' : ''}aucune date ferme avant décision.</div>`; set('expertReviewStatus',valuation.expertReviewStatus || 'À décider par David / Bénédicte',true); } else $('valuationAlert').innerHTML='<div class="alert success">Aucune alerte automatique de valeur élevée ou de rareté avec les informations saisies.</div>';
    const schedule=result?.data?.schedule; $('planningPreview').innerHTML=schedule?.blocked ? '<strong>Date à déterminer.</strong><div class="muted">Le client sera recontacté après décision.</div>' : `<strong>Inspection : ${esc(schedule?.inspection?.date || 'à confirmer')} à ${esc(schedule?.inspection?.time || '')}</strong><div class="muted">Intervention : ${esc(schedule?.intervention?.startDate || '')} → ${esc(schedule?.intervention?.endDate || '')} · livraison ${esc(schedule?.intervention?.deliveryDate || '')}. Samedi et dimanche exclus.</div>`;
    renderInference(result?.data?.package?.inference || {}); const price=Number(result?.data?.package?.totalTtc || numeric('finalPrice') || 0); $('priceCheckText').textContent=`Prix proposé : ${price.toLocaleString('fr-FR')} € TTC pour « ${result?.data?.package?.label || value('service') || 'prestation à définir'} ».`;
    if (state.isDirection && !fromRequest) $('priceCheck').classList.add('show'); $('createButton').disabled=true; $('createTop').disabled=true; updateMetrics();
  }
  async function preview() { if (!state.isDirection) return submitRequest(); if (!value('vehicleType')) return categoryRequiredMessage(); await saveDraft(true); $('quotePreview').textContent='Jarvis contrôle la catégorie, le dossier, le tarif, la marge, la procédure, les valeurs et le planning…'; try { renderPreview(await api('/api/quote-studio/preview',{method:'POST',body:JSON.stringify(payload())})); } catch(error) { $('quotePreview').textContent=`Prévisualisation impossible : ${error.message}`; $('previewWarnings').innerHTML=error.missingFields ? `<div class="alert bad">Champs manquants : ${esc(error.missingFields.join(', '))}</div>` : ''; } }
  function confirmPrice() { if (!state.preview) return; state.priceConfirmed=true; $('priceCheck').classList.remove('show'); $('createButton').disabled=!state.preview.canCreate; $('createTop').disabled=!state.preview.canCreate; $('packageInference').insertAdjacentHTML('beforeend','<div class="alert success">Prix confirmé humainement.</div>'); }
  async function rejectPrice() { state.priceConfirmed=false; $('createButton').disabled=true; $('createTop').disabled=true; await inferPrice(); $('priceCheck').classList.remove('show'); $('packageInference').insertAdjacentHTML('beforeend','<div class="alert">Choisissez un tarif ou saisissez un prix final et un motif, puis relancez la prévisualisation.</div>'); }
  async function createQuote() {
    if (!state.isDirection || !state.preview || !state.priceConfirmed) return;
    $('creationResult').innerHTML='<div class="status">Création du dossier, du devis texte, du visuel et du brouillon d’e-mail…</div>';
    try { const result=await api('/api/quote-studio/confirm',{method:'POST',body:JSON.stringify({...payload(),humanConfirmed:true,priceConfirmed:true,acceptInferredPackage:false})}); state.currentQuote=result.quote; state.dirty=false; $('creationResult').innerHTML=`<div class="alert success"><strong>Devis ${esc(result.quote.number)} créé.</strong><div>Nature : ${esc(categoryLabel(result.quote.requestCategory || result.quote.vehicleType))}. Le texte, la procédure et le visuel sont conservés avant envoi.</div><div class="actions"><a class="button primary" href="${esc(result.visualUrl)}" target="_blank" rel="noopener">Ouvrir le devis visuel</a><button type="button" id="copyQuoteText">Copier le texte exact</button><a class="button" href="/planning" data-confirm-leave>Ouvrir le planning</a></div></div>`; $('copyQuoteText').onclick=()=>navigator.clipboard?.writeText(result.quoteText || ''); $('contactExpertButton').classList.toggle('hidden',!result.quote.expertReviewRequired); await loadRecentQuotes(); }
    catch(error) { $('creationResult').innerHTML=`<div class="alert bad">${esc(error.message)}${error.missingFields ? ` — ${esc(error.missingFields.join(', '))}` : ''}</div>`; }
  }
  async function contactExpert(quoteId=state.currentQuote?.id) { if (!quoteId) return; const reason=prompt('Motif à transmettre :','Valeur élevée, rareté ou étude spécialisée à confirmer avant planification.'); if (reason===null) return; try { const result=await api(`/api/quote-studio/${encodeURIComponent(quoteId)}/expert-contact`,{method:'POST',body:JSON.stringify({reason,assignee:'David'})}); $('creationResult').insertAdjacentHTML('beforeend','<div class="alert success">Tâche expert et brouillon interne créés. Aucun message envoyé.</div>'); state.currentQuote=result.quote; await loadRecentQuotes(); } catch(error) { $('creationResult').insertAdjacentHTML('beforeend',`<div class="alert bad">${esc(error.message)}</div>`); } }

  function fillFromRequest(request) {
    state.requestId=request.id; for (const id of fieldIds.filter((id)=>id!=='voiceText')) if (request[id]!==undefined && request[id]!==null) set(id,request[id],true); set('vehicleType',request.requestCategory || request.vehicleType || '',true); set('voiceText',request.voiceText || '',true); set('packageKey',request.tariffKey || request.packageKey || '',true); state.specialOfferEnabled=request.specialOfferEnabled===true; $('specialOfferPanel').classList.toggle('show',state.specialOfferEnabled); updateCategoryButtons(); renderProcedure(); calculateMargin(); updateMetrics(); setSaveStatus(`Demande ${request.number} chargée`,true); if (request.jarvisProposal) renderPreview(request.jarvisProposal,true); window.scrollTo({top:0,behavior:'smooth'});
  }
  function requestCard(request) {
    const proposalPrice=Number(request.jarvisProposal?.data?.package?.totalTtc || request.finalPrice || request.targetPrice || 0); const category=request.requestCategory || request.vehicleType || '';
    return `<article class="result-card"><strong>${esc(request.number || 'Demande')} — ${esc(request.clientName || 'Client à compléter')} — ${esc([request.brand,request.model].filter(Boolean).join(' ') || 'dossier à compléter')}</strong><span class="muted">${esc(categoryLabel(category))} · ${esc(request.customerType || '')} · ${proposalPrice ? `${proposalPrice.toLocaleString('fr-FR')} €` : 'prix à valider'} · ${esc(request.status || '')}</span><div class="result-actions"><button type="button" data-load-request="${esc(request.id)}">Charger</button>${state.isDirection && /validation|proposition/i.test(request.status || '') ? `<button class="primary" type="button" data-request-decision="Validée" data-id="${esc(request.id)}">Valider pour étude</button><button class="warn" type="button" data-request-decision="À revoir" data-id="${esc(request.id)}">À revoir</button><button class="danger" type="button" data-request-decision="Refusée" data-id="${esc(request.id)}">Refuser</button>` : ''}</div>${request.directionComment ? `<div class="status">Direction : ${esc(request.directionComment)}</div>` : ''}</article>`;
  }
  async function loadRequests() { try { const result=await api('/api/quote-requests'); const records=result.records || []; $('quoteRequests').innerHTML=records.map(requestCard).join('') || '<div class="muted">Aucune demande enregistrée.</div>'; $('quoteRequests').querySelectorAll('[data-load-request]').forEach((button)=>button.onclick=()=>{ const request=records.find((item)=>item.id===button.dataset.loadRequest); if(request) fillFromRequest(request); }); $('quoteRequests').querySelectorAll('[data-request-decision]').forEach((button)=>button.onclick=async()=>{ const comment=prompt('Commentaire de la direction :',button.dataset.requestDecision==='Validée' ? 'Proposition à vérifier puis à transformer en devis.' : '') || ''; try { await api(`/api/quote-requests/${encodeURIComponent(button.dataset.id)}/decision`,{method:'POST',body:JSON.stringify({decision:button.dataset.requestDecision,comment})}); await loadRequests(); } catch(error) { alert(error.message); } }); } catch(error) { $('quoteRequests').innerHTML=`<div class="alert bad">${esc(error.message)}</div>`; } }
  async function loadRecentQuotes() { if (!state.isDirection) return; try { const result=await api('/api/quote-studio/quotes'); $('recentQuotes').innerHTML=(result.records || []).slice(0,20).map((quote)=>`<div class="result-card"><strong>${esc(quote.number)} — ${esc(quote.clientName || 'Client')} — ${esc(quote.vehicleLabel || '')}</strong><span class="muted">${esc(categoryLabel(quote.requestCategory || quote.vehicleType))} · ${esc(quote.service || '')} · ${Number(quote.totalTtc || 0).toLocaleString('fr-FR')} € · ${esc(quote.status || '')}</span><div class="result-actions">${quote.visualUrl ? `<a class="button" href="${esc(quote.visualUrl)}" target="_blank" rel="noopener">Visuel</a>` : ''}<a class="button" href="/planning?quote=${encodeURIComponent(quote.id)}" data-confirm-leave>Planifier</a>${quote.expertReviewRequired && quote.expertReviewStatus!=='Approuvée' ? `<button type="button" data-expert-quote="${esc(quote.id)}">Contacter l’expert</button>` : ''}</div></div>`).join('') || '<div class="muted">Aucun devis créé.</div>'; $('recentQuotes').querySelectorAll('[data-expert-quote]').forEach((button)=>button.onclick=()=>contactExpert(button.dataset.expertQuote)); } catch(error) { $('recentQuotes').innerHTML=`<div class="alert bad">${esc(error.message)}</div>`; } }
  function installLeaveProtection() {
    document.addEventListener('click',async(event)=>{ const link=event.target.closest('a[href]'); if(!link || link.target==='_blank' || state.allowLeave || !state.acquired) return; event.preventDefault(); const ok=confirm('Quitter la page Devis ? Les informations acquises vont être enregistrées dans la demande et le dossier avant de partir.'); if(!ok) return; await saveDraft(true); state.allowLeave=true; location.href=link.href; });
    window.addEventListener('beforeunload',(event)=>{ if(state.allowLeave || !state.acquired) return; try { navigator.sendBeacon('/api/quote-requests/draft',new Blob([JSON.stringify(payload())],{type:'application/json'})); } catch {} event.preventDefault(); event.returnValue=''; });
  }
  async function init() {
    try { const [me,packages,procedures]=await Promise.all([api('/api/auth/me'),api('/api/quote-studio/packages'),api('/api/workshop/procedures')]); state.me=me.user; state.packages=packages.records || []; state.procedures=procedures.records || []; applyRole(); populatePackages(); renderProcedure(); }
    catch(error) { $('packageInference').textContent=error.message; }
    const today=new Date().toISOString().slice(0,10); $('earliestDate').value=today;
    fieldIds.forEach((id)=>{ const element=$(id); if(!element) return; element.addEventListener('input',()=>{ if(['discountPercent','discountAmountTtc','finalPrice','standardPriceTtc','directCostTtc','targetMarginPercent'].includes(id)) calculateMargin(id); markChanged(); }); element.addEventListener('change',()=>{ if(id==='vehicleType') chooseCategory(value('vehicleType'),'select'); else if(id==='customerType') selectContextPackage(); }); });
    document.querySelectorAll('[data-category]').forEach((button)=>button.onclick=()=>chooseCategory(button.dataset.category));
    $('packageKey').addEventListener('change',onPackageChange); $('targetPrice').addEventListener('change',inferPrice); $('dictateButton').onclick=startDictation; $('voiceText').addEventListener('change',parseVoice); $('lookupButton').onclick=lookup; $('lookupQuery').addEventListener('keydown',(event)=>{ if(event.key==='Enter'){event.preventDefault();lookup();} }); $('newDossierButton').onclick=newDossier; $('specialOfferButton').onclick=toggleSpecialOffer;
    for(const id of ['saveDraftTop','saveDraftButton']) $(id).onclick=()=>saveDraft(false); for(const id of ['submitRequestTop','submitRequestButton']) $(id).onclick=submitRequest; for(const id of ['previewTop','previewButton']) $(id).onclick=preview; $('priceYes').onclick=confirmPrice; $('priceNo').onclick=rejectPrice; $('createButton').onclick=createQuote; $('createTop').onclick=createQuote; $('contactExpertButton').onclick=()=>contactExpert();
    installLeaveProtection(); await Promise.all([loadRequests(),loadRecentQuotes()]);
    const requestId=new URLSearchParams(location.search).get('request'); if(requestId){ try{ const result=await api(`/api/quote-requests/${encodeURIComponent(requestId)}`); fillFromRequest(result.request); }catch{} }
    updateCategoryButtons(); updateMetrics(); setSaveStatus('Saisie prête — enregistrement automatique',false); $('jarvisStatus').textContent='Jarvis : de quoi s’agit-il ?';
  }
  init();
})();
