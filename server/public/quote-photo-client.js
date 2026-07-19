(() => {
  'use strict';
  if (window.__MAVIK_QUOTE_PHOTO_CLIENT__) return;
  window.__MAVIK_QUOTE_PHOTO_CLIENT__ = true;

  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers:{ 'Content-Type':'application/json', ...(options.headers || {}) }, cache:'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Erreur ${response.status}`); Object.assign(error, data); throw error; }
    return data;
  };
  const state = { photos:[], analysis:null, pricing:null, questions:[], busy:false };
  const hiddenIds = ['photoUrlsJson','photoAnalysisJson','dirtLevel','dirtyAreas','accessConstraints','industrialSite','industrialMachineFunction','industrialDimensions','industrialMaterials','industrialZones','industrialEnergySources','industrialConsignation','industrialProductionConstraints','industrialAccessMeans','industrialWasteRecovery','industrialSafetyRules','industrialShutdownWindow','photoAnalysisConfirmed','deliveryDestination','deliveryTrips','deliveryRateHt','deliveryAssignee','deliveryVehicle'];

  function style() {
    const node = document.createElement('style');
    node.textContent = `.photo-first{border-color:rgba(145,210,238,.38)!important;background:linear-gradient(145deg,rgba(17,50,63,.96),rgba(7,23,30,.94))!important}.photo-first h1{font-size:25px}.photo-drop{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(0,1.3fr);gap:14px}.photo-picker{display:grid;place-items:center;min-height:180px;border:2px dashed rgba(145,210,238,.35);border-radius:17px;background:rgba(2,11,16,.35);padding:18px;text-align:center}.photo-picker input{max-width:100%}.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}.photo-thumb{position:relative;min-height:120px;border:1px solid rgba(218,241,249,.13);border-radius:13px;overflow:hidden;background:#07141c}.photo-thumb img{width:100%;height:120px;object-fit:cover;display:block}.photo-thumb span{position:absolute;left:5px;right:5px;bottom:5px;padding:4px 6px;border-radius:8px;background:rgba(0,0,0,.7);font-size:9px}.photo-analysis{margin-top:11px}.intake-questions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:11px}.intake-question{padding:10px;border:1px solid rgba(218,241,249,.11);border-radius:13px;background:rgba(2,11,16,.34)}.intake-question small{display:block;color:#9ab0ba;margin:4px 0 7px}.delivery-box{margin-top:12px;padding:13px;border:1px solid rgba(145,188,91,.3);border-radius:15px;background:rgba(75,110,47,.12)}.delivery-row{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px}.photo-warning{color:#ffcf72}.photo-ok{color:#9be0a7}@media(max-width:850px){.photo-drop,.intake-questions,.delivery-row{grid-template-columns:1fr}}`;
    document.head.appendChild(node);
  }
  function hiddenInput(id, value = '') {
    let input = $(id);
    if (!input) { input = document.createElement('input'); input.type='hidden'; input.id=id; input.value=value; document.body.appendChild(input); }
    return input;
  }
  function emit(id, value, change = false) {
    const element = $(id); if (!element) return;
    element.value = value ?? '';
    element.dispatchEvent(new Event('input', { bubbles:true }));
    if (change) element.dispatchEvent(new Event('change', { bubbles:true }));
  }
  function mapColor(r,g,b) {
    const max=Math.max(r,g,b), min=Math.min(r,g,b), delta=max-min;
    if (max < 45) return 'Noir';
    if (min > 205 && delta < 28) return 'Blanc';
    if (delta < 24) return max > 150 ? 'Gris clair' : 'Gris';
    let h=0;
    if(max===r)h=((g-b)/delta)%6; else if(max===g)h=(b-r)/delta+2; else h=(r-g)/delta+4;
    h=(h*60+360)%360;
    if(h<15||h>=345)return 'Rouge'; if(h<45)return 'Orange'; if(h<70)return 'Jaune'; if(h<165)return 'Vert'; if(h<255)return 'Bleu'; if(h<315)return 'Violet'; return 'Rouge';
  }
  async function imageFacts(file) {
    const dataUrl = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
    let dominantColor=''; let detectedText='';
    try {
      const bitmap=await createImageBitmap(file); const canvas=document.createElement('canvas'); canvas.width=24; canvas.height=24; const context=canvas.getContext('2d',{willReadFrequently:true}); context.drawImage(bitmap,0,0,24,24); const pixels=context.getImageData(0,0,24,24).data; let r=0,g=0,b=0,count=0;
      for(let i=0;i<pixels.length;i+=4){const rr=pixels[i],gg=pixels[i+1],bb=pixels[i+2],a=pixels[i+3];if(a<180)continue;if(rr>245&&gg>245&&bb>245)continue;r+=rr;g+=gg;b+=bb;count+=1}
      if(count) dominantColor=mapColor(r/count,g/count,b/count);
      if ('TextDetector' in window) { const detector=new window.TextDetector(); const found=await detector.detect(bitmap); detectedText=(found||[]).map((item)=>item.rawValue||'').filter(Boolean).join(' '); }
      bitmap.close?.();
    } catch {}
    return { dataUrl, name:file.name, dominantColor, detectedText };
  }
  function panel() {
    const main=document.querySelector('main.shell'); if(!main || $('photoFirstPanel')) return;
    hiddenIds.forEach((id)=>hiddenInput(id, id==='deliveryDestination'?'Bayonne':id==='deliveryTrips'?'1':id==='deliveryRateHt'?'85':id==='deliveryAssignee'?'Séverine':id==='deliveryVehicle'?'Camion':''));
    hiddenInput('photoUrlsJson','[]'); hiddenInput('photoAnalysisJson','{}');
    const section=document.createElement('section'); section.className='panel photo-first'; section.id='photoFirstPanel';
    section.innerHTML=`<div class="actions" style="justify-content:space-between;align-items:flex-start;margin-top:0"><div><h1>1. Photo générale puis zones à traiter</h1><div class="muted">Dès l’ouverture d’un devis, commencez par une vue générale. Ajoutez ensuite plusieurs photos des endroits habituellement sales. Les suggestions de Jarvis restent à confirmer avant le devis.</div></div><span class="mode-badge">Photo d’abord</span></div><div class="photo-drop"><label class="photo-picker"><strong>Prendre ou choisir les photos</strong><span class="muted">Première photo : vue générale. Puis dessous, passages de roues, moteur, machine ou zones demandées.</span><input id="quotePhotoFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment"></label><div><div id="quotePhotoGrid" class="photo-grid"><div class="muted">Aucune photo. Le dossier ne sera pas analysé avant la première image.</div></div><div id="quotePhotoStatus" class="status photo-analysis">Jarvis attend la photo générale.</div></div></div><div id="photoSuggestedFields" class="status"></div><div id="photoQuestions" class="intake-questions"></div><div class="delivery-box"><label class="consent"><input id="deliveryRequired" type="checkbox"><span><strong>Service livraison</strong><br>85 € HT par heure et par voyage. Pour Bayonne, un voyage bloque le camion et Séverine de 08:30 à 09:30.</span></label><div id="deliveryFields" class="delivery-row hidden" style="margin-top:9px"><div><label>Destination</label><input id="deliveryDestinationVisible" value="Bayonne"></div><div><label>Nombre de voyages</label><select id="deliveryTripsVisible"><option value="1">1 voyage</option><option value="2">2 voyages</option></select></div><div><label>Tarif HT / heure</label><input value="85 €" disabled></div><div><label>Responsable / véhicule</label><input value="Séverine · Camion" disabled></div></div><div id="deliveryAmount" class="muted" style="margin-top:7px">Aucune livraison ajoutée.</div></div>`;
    main.insertBefore(section, main.firstElementChild);
    $('quotePhotoFiles').addEventListener('change', handleFiles);
    $('deliveryRequired').addEventListener('change', deliveryChange);
    $('deliveryDestinationVisible').addEventListener('input', deliveryChange);
    $('deliveryTripsVisible').addEventListener('change', deliveryChange);
  }
  function deliveryChange() {
    const enabled=$('deliveryRequired').checked; $('deliveryFields').classList.toggle('hidden',!enabled);
    hiddenInput('deliveryDestination').value=$('deliveryDestinationVisible').value.trim()||'Bayonne';
    hiddenInput('deliveryTrips').value=enabled?$('deliveryTripsVisible').value:'0';
    hiddenInput('deliveryRateHt').value='85'; hiddenInput('deliveryAssignee').value='Séverine'; hiddenInput('deliveryVehicle').value='Camion';
    const trips=enabled?Number($('deliveryTripsVisible').value||1):0; const ht=85*trips; const ttc=ht*1.2;
    $('deliveryAmount').textContent=enabled?`${trips} voyage(s) · ${ht.toLocaleString('fr-FR')} € HT · ${ttc.toLocaleString('fr-FR')} € TTC · bloc 08:30–09:30 par voyage`:'Aucune livraison ajoutée.';
    window.dispatchEvent(new CustomEvent('mavik-quote-change'));
  }
  function renderPhotos() {
    $('quotePhotoGrid').innerHTML=state.photos.map((photo,index)=>`<figure class="photo-thumb"><img src="${esc(photo.dataUrl||photo.url)}" alt="Photo ${index+1}"><span>${index===0?'Vue générale':`Zone ${index}`} · ${esc(photo.dominantColor||'couleur à confirmer')}</span></figure>`).join('')||'<div class="muted">Aucune photo.</div>';
  }
  function renderQuestions(result) {
    state.questions=result.questions||[];
    $('photoQuestions').innerHTML=state.questions.map((question)=>`<label class="intake-question"><strong>${esc(question.label)}</strong><small>${esc(question.help||'')}</small><textarea id="${esc(question.key)}Visible" rows="2"></textarea></label>`).join('');
    state.questions.forEach((question)=>{
      hiddenInput(question.key);
      const visible=$(`${question.key}Visible`); if(!visible)return;
      visible.value=hiddenInput(question.key).value||'';
      visible.addEventListener('input',()=>{hiddenInput(question.key).value=visible.value;window.dispatchEvent(new CustomEvent('mavik-quote-change'))});
    });
  }
  function applyResult(result) {
    state.analysis=result.analysis||null; state.pricing=result.pricing||null;
    hiddenInput('photoUrlsJson').value=JSON.stringify((result.photos||[]).map((item)=>item.url));
    hiddenInput('photoAnalysisJson').value=JSON.stringify(result.analysis||{});
    hiddenInput('photoAnalysisConfirmed').value='false';
    if(result.photos?.[0]?.url) emit('photoUrl',result.photos[0].url);
    const fields=result.suggestedFields||{};
    if(fields.requestCategory && !$('vehicleType')?.value) emit('vehicleType',fields.requestCategory,true);
    if(fields.registration && !$('registration')?.value) emit('registration',fields.registration);
    if(fields.color && !$('color')?.value) emit('color',fields.color);
    renderQuestions(result);
    const range=result.pricing?.minimumTtc?`${Number(result.pricing.minimumTtc).toLocaleString('fr-FR')} à ${Number(result.pricing.maximumTtc||result.pricing.minimumTtc).toLocaleString('fr-FR')} € TTC`:(result.pricing?.records||[]).some((item)=>item.hourlyRateHt)?`${(result.pricing.records||[]).find((item)=>item.hourlyRateHt)?.hourlyRateHt||180} € HT/h — chiffrage direction`:'prix à étudier';
    $('photoSuggestedFields').innerHTML=`<strong>Identification préparée à confirmer</strong><div class="muted">Catégorie : ${esc(fields.requestCategory||'à choisir')} · immatriculation/référence : ${esc(fields.registration||'non détectée')} · couleur dominante : ${esc(fields.color||'à renseigner')} · fourchette disponible : ${esc(range)}.</div><div class="photo-warning">${esc(result.analysis?.limitations||'')}</div><div class="actions"><button type="button" id="confirmPhotoAnalysis">Confirmer les informations visibles</button></div>`;
    $('confirmPhotoAnalysis').onclick=()=>{hiddenInput('photoAnalysisConfirmed').value='true';$('quotePhotoStatus').innerHTML='<strong class="photo-ok">Identification confirmée par l’utilisateur.</strong><div>Les photos, constats et réponses seront joints au dossier et au devis.</div>';window.dispatchEvent(new CustomEvent('mavik-quote-change'))};
  }
  async function handleFiles(event) {
    if(state.busy)return; const files=[...(event.target.files||[])].slice(0,12); if(!files.length)return;
    state.busy=true; $('quotePhotoStatus').textContent='Préparation des photos et lecture locale disponible…';
    try {
      state.photos=await Promise.all(files.map(imageFacts)); renderPhotos();
      const result=await api('/api/quote-studio/photos/analyze',{method:'POST',body:JSON.stringify({photos:state.photos,requestCategory:$('vehicleType')?.value||'',brand:$('brand')?.value||'',model:$('model')?.value||'',registration:$('registration')?.value||'',color:$('color')?.value||'',notes:$('vehicleNotes')?.value||'',clientId:$('clientId')?.value||'',vehicleId:$('vehicleId')?.value||'',requestId:window.MAVIKQuoteRequestId||''})});
      state.photos=(result.photos||[]).map((saved,index)=>({...state.photos[index],...saved})); renderPhotos(); applyResult(result);
      $('quotePhotoStatus').innerHTML=`<strong>${result.photos.length} photo(s) enregistrée(s).</strong><div>Ajoutez les précisions demandées puis confirmez l’identification.</div>`;
    } catch(error) { $('quotePhotoStatus').innerHTML=`<strong class="bad">${esc(error.message)}</strong>${error.missingFields?`<div>${esc(error.missingFields.join(', '))}</div>`:''}`; }
    finally { state.busy=false; }
  }
  function install() { if(location.pathname!=='/quotes')return; style(); panel(); deliveryChange(); window.MAVIKQuotePhotoIntake={state,payload:()=>({photoUrls:JSON.parse(hiddenInput('photoUrlsJson').value||'[]'),photoAnalysis:JSON.parse(hiddenInput('photoAnalysisJson').value||'{}')})}; }
  install();
})();
