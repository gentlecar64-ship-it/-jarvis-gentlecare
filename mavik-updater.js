(()=>{
  const CURRENT_VERSION='0.30.0';
  const STORAGE_KEY='mavik-update-preferences';
  const HISTORY_KEY='mavik-update-history';
  const CHECK_INTERVAL=5*60*1000;
  let pendingVersion=null;
  let scheduledTimer=null;

  const defaults={
    autoWindowEnabled:true,
    windowStart:'22:00',
    windowEnd:'06:00',
    scheduledAt:null,
    consentMode:'ask'
  };

  function loadPrefs(){
    try{return {...defaults,...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return {...defaults}}
  }

  function savePrefs(prefs){localStorage.setItem(STORAGE_KEY,JSON.stringify(prefs))}

  function addHistory(entry){
    let history=[];
    try{history=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{}
    history.unshift({...entry,at:new Date().toISOString()});
    localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,50)));
  }

  function versionParts(v){return String(v||'0').split('.').map(n=>parseInt(n,10)||0)}
  function isNewer(remote,local){
    const a=versionParts(remote),b=versionParts(local);
    for(let i=0;i<Math.max(a.length,b.length);i++){
      if((a[i]||0)>(b[i]||0))return true;
      if((a[i]||0)<(b[i]||0))return false;
    }
    return false;
  }

  function ensureUI(){
    if(document.getElementById('mavikUpdater'))return;
    const root=document.createElement('div');
    root.id='mavikUpdater';
    root.innerHTML=`
      <style>
        #mavikUpdater{position:fixed;inset:0;z-index:99999;display:none;place-items:center;background:rgba(0,8,14,.82);backdrop-filter:blur(8px);padding:16px;font-family:Inter,system-ui,sans-serif}
        #mavikUpdater.open{display:grid}
        #mavikUpdater .box{width:min(560px,100%);background:#061520;border:1px solid #1a607d;border-radius:18px;padding:20px;color:#f4fbff;box-shadow:0 24px 70px rgba(0,0,0,.55)}
        #mavikUpdater h2{margin:0 0 8px;font-size:1.3rem}#mavikUpdater p{color:#a8bfca;line-height:1.45}
        #mavikUpdater .bar{height:14px;background:#0b2737;border:1px solid #1a526a;border-radius:20px;overflow:hidden;margin:14px 0}
        #mavikUpdater .fill{height:100%;width:0;background:linear-gradient(90deg,#13e86a,#00cfff);transition:width .35s ease}
        #mavikUpdater .status{font-size:.88rem;color:#d9f6ff;min-height:22px}
        #mavikUpdater .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
        #mavikUpdater button,#mavikUpdater input{border-radius:9px;border:1px solid #23617a;background:#0a2635;color:#fff;padding:10px 12px;font:inherit}
        #mavikUpdater button.primary{background:#0b6c36;border-color:#18a856;font-weight:800}
        #mavikUpdater button.secondary{background:#113142}
        #mavikUpdater .schedule{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
        #mavikUpdater .meta{font-size:.78rem;color:#82a6b7;margin-top:8px}
      </style>
      <div class="box" role="dialog" aria-modal="true" aria-labelledby="mavikUpdateTitle">
        <h2 id="mavikUpdateTitle">Mise à jour MAVIK</h2>
        <p id="mavikUpdateText">Une nouvelle version est disponible.</p>
        <div class="bar"><div class="fill" id="mavikUpdateFill"></div></div>
        <div class="status" id="mavikUpdateStatus">En attente de votre choix.</div>
        <div class="meta" id="mavikUpdateMeta"></div>
        <div class="actions" id="mavikUpdateActions">
          <button class="primary" id="mavikUpdateNow">Installer maintenant</button>
          <button class="secondary" id="mavikUpdateLater">Plus tard</button>
        </div>
        <div class="schedule" id="mavikScheduleRow">
          <label for="mavikUpdateTime">Installer à</label>
          <input type="time" id="mavikUpdateTime" value="22:00">
          <button class="secondary" id="mavikScheduleBtn">Programmer</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    document.getElementById('mavikUpdateNow').onclick=()=>runUpdate();
    document.getElementById('mavikUpdateLater').onclick=()=>closeUI();
    document.getElementById('mavikScheduleBtn').onclick=()=>scheduleAt(document.getElementById('mavikUpdateTime').value);
  }

  function openUI(manifest){
    ensureUI();
    pendingVersion=manifest;
    document.getElementById('mavikUpdateText').textContent=`Version ${manifest.version} disponible. Vous pouvez l’installer maintenant ou choisir une heure.`;
    document.getElementById('mavikUpdateMeta').textContent=`Version installée : ${CURRENT_VERSION} · Canal : ${manifest.channel||'stable'}`;
    document.getElementById('mavikUpdateStatus').textContent='En attente de votre choix.';
    document.getElementById('mavikUpdateFill').style.width='0%';
    document.getElementById('mavikUpdater').classList.add('open');
  }

  function closeUI(){const el=document.getElementById('mavikUpdater');if(el)el.classList.remove('open')}

  function isWithinWindow(start,end,date=new Date()){
    const now=date.getHours()*60+date.getMinutes();
    const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
    const s=sh*60+sm,e=eh*60+em;
    return s<=e?(now>=s&&now<=e):(now>=s||now<=e);
  }

  function scheduleAt(time){
    if(!pendingVersion||!time)return;
    const now=new Date();
    const [h,m]=time.split(':').map(Number);
    const target=new Date(now);target.setHours(h,m,0,0);if(target<=now)target.setDate(target.getDate()+1);
    const prefs=loadPrefs();prefs.scheduledAt=target.toISOString();savePrefs(prefs);
    addHistory({type:'scheduled',version:pendingVersion.version,scheduledAt:prefs.scheduledAt});
    document.getElementById('mavikUpdateStatus').textContent=`Installation programmée à ${target.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}.`;
    armScheduledUpdate();
    setTimeout(closeUI,1400);
  }

  function armScheduledUpdate(){
    if(scheduledTimer)clearTimeout(scheduledTimer);
    const prefs=loadPrefs();if(!prefs.scheduledAt)return;
    const delay=new Date(prefs.scheduledAt).getTime()-Date.now();
    if(delay<=0){runUpdate();return}
    scheduledTimer=setTimeout(()=>runUpdate(),Math.min(delay,2147483647));
  }

  async function progress(value,status){
    ensureUI();document.getElementById('mavikUpdater').classList.add('open');
    document.getElementById('mavikUpdateFill').style.width=value+'%';
    document.getElementById('mavikUpdateStatus').textContent=status;
    await new Promise(r=>setTimeout(r,350));
  }

  async function runUpdate(){
    const manifest=pendingVersion||await fetchManifest();
    if(!manifest)return;
    try{
      await progress(10,'Connexion au service de mise à jour…');
      const registration=await navigator.serviceWorker?.getRegistration();
      await progress(30,'Téléchargement des fichiers…');
      if(registration)await registration.update();
      await progress(60,'Installation de la nouvelle version…');
      if(registration?.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      await progress(82,'Vérification de l’intégrité…');
      localStorage.setItem('mavik-installed-version',manifest.version);
      const prefs=loadPrefs();prefs.scheduledAt=null;savePrefs(prefs);
      addHistory({type:'installed',version:manifest.version,status:'success'});
      await progress(100,'Mise à jour terminée. Redémarrage…');
      setTimeout(()=>location.reload(true),700);
    }catch(error){
      addHistory({type:'installed',version:manifest.version,status:'error',error:String(error)});
      document.getElementById('mavikUpdateStatus').textContent='Échec de la mise à jour. Une nouvelle tentative sera proposée.';
      document.getElementById('mavikUpdateFill').style.width='0%';
    }
  }

  async function fetchManifest(){
    try{
      const response=await fetch(`version.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw new Error('manifest unavailable');
      return await response.json();
    }catch{return null}
  }

  async function checkForUpdates({manual=false}={}){
    const manifest=await fetchManifest();
    if(!manifest){if(manual)alert('Impossible de vérifier les mises à jour pour le moment.');return}
    const installed=localStorage.getItem('mavik-installed-version')||CURRENT_VERSION;
    if(!isNewer(manifest.version,installed)){
      if(manual)alert(`MAVIK est à jour (${installed}).`);
      return;
    }
    pendingVersion=manifest;
    const prefs=loadPrefs();
    if(prefs.scheduledAt){armScheduledUpdate();return}
    if(prefs.autoWindowEnabled&&isWithinWindow(prefs.windowStart,prefs.windowEnd)){
      runUpdate();return;
    }
    openUI(manifest);
  }

  window.MavikUpdater={
    check:()=>checkForUpdates({manual:true}),
    preferences:()=>loadPrefs(),
    savePreferences:p=>{const next={...loadPrefs(),...p};savePrefs(next);return next},
    history:()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}},
    installNow:runUpdate
  };

  window.addEventListener('load',()=>{
    ensureUI();armScheduledUpdate();checkForUpdates();setInterval(()=>checkForUpdates(),CHECK_INTERVAL);
  });
})();
