(()=>{
  const KEY='mavik-update-preferences';
  const defaults={autoWindowEnabled:true,windowStart:'22:00',windowEnd:'06:00',scheduledAt:null,consentMode:'ask'};
  function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}}
  function save(p){localStorage.setItem(KEY,JSON.stringify(p));return p}
  function mount(){
    if(document.getElementById('mavikUpdateSettingsButton'))return;
    const button=document.createElement('button');
    button.id='mavikUpdateSettingsButton';
    button.textContent='Mises à jour';
    button.title='Régler les mises à jour MAVIK';
    button.style.cssText='position:fixed;left:14px;bottom:14px;z-index:40500;border:1px solid #24617a;background:#071d2a;color:#eaf9ff;border-radius:10px;padding:9px 11px;font:600 12px system-ui;box-shadow:0 8px 25px #0008;cursor:pointer';
    button.onclick=open;
    document.body.appendChild(button);
  }
  function open(){
    const p=load();
    const root=document.createElement('div');
    root.id='mavikUpdateSettingsPanel';
    root.style.cssText='position:fixed;inset:0;z-index:100001;display:grid;place-items:center;background:#000b;padding:16px;font-family:system-ui';
    root.innerHTML=`<div style="width:min(520px,100%);background:#061520;color:#f5fbff;border:1px solid #1e607b;border-radius:18px;padding:20px;box-shadow:0 24px 70px #000a">
      <h2 style="margin:0 0 8px">Préférences de mise à jour</h2>
      <p style="color:#9fb8c5;line-height:1.45">MAVIK peut installer automatiquement les mises à jour pendant la plage choisie. En dehors de cette plage, le client décide : maintenant, plus tard ou à une heure précise.</p>
      <label style="display:flex;gap:10px;align-items:center;margin:16px 0"><input id="mavikAutoWindow" type="checkbox" ${p.autoWindowEnabled?'checked':''}> Autoriser l’installation automatique dans cette plage</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label>Début<input id="mavikWindowStart" type="time" value="${p.windowStart}" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:9px;border:1px solid #24617a;background:#0a2635;color:#fff"></label>
        <label>Fin<input id="mavikWindowEnd" type="time" value="${p.windowEnd}" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:9px;border:1px solid #24617a;background:#0a2635;color:#fff"></label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap">
        <button id="mavikCheckNow" style="padding:10px 12px;border-radius:9px;border:1px solid #24617a;background:#0a2635;color:#fff">Vérifier maintenant</button>
        <button id="mavikCancelSettings" style="padding:10px 12px;border-radius:9px;border:1px solid #24617a;background:#0a2635;color:#fff">Annuler</button>
        <button id="mavikSaveSettings" style="padding:10px 12px;border-radius:9px;border:1px solid #18a856;background:#0b6c36;color:#fff;font-weight:800">Enregistrer</button>
      </div>
    </div>`;
    document.body.appendChild(root);
    root.querySelector('#mavikCancelSettings').onclick=()=>root.remove();
    root.querySelector('#mavikSaveSettings').onclick=()=>{
      save({...p,autoWindowEnabled:root.querySelector('#mavikAutoWindow').checked,windowStart:root.querySelector('#mavikWindowStart').value,windowEnd:root.querySelector('#mavikWindowEnd').value});
      root.remove();
      alert('Préférences de mise à jour enregistrées.');
    };
    root.querySelector('#mavikCheckNow').onclick=()=>{root.remove();window.MavikUpdater?.check()};
  }
  window.addEventListener('load',mount);
})();
