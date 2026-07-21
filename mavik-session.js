(()=>{
  const script=document.currentScript;
  const root=new URL('./',script?.src||location.href);
  const loginUrl=new URL('index.html',root);
  const parse=(value,fallback)=>{try{return JSON.parse(value)||fallback}catch{return fallback}};
  const session=parse(sessionStorage.getItem('jarvis-session'),null);
  const accounts=parse(localStorage.getItem('jarvis-accounts'),'');
  const user=Array.isArray(accounts)?accounts.find(account=>account.id===session?.id):null;

  function relativeCurrentLocation(){
    const basePath=root.pathname.endsWith('/')?root.pathname:root.pathname+'/';
    const relative=location.pathname.startsWith(basePath)?location.pathname.slice(basePath.length):'';
    return relative+location.search+location.hash;
  }

  function redirectToLogin(){
    const target=new URL(loginUrl.href);
    const relative=relativeCurrentLocation();
    if(relative&&relative!=='index.html')target.searchParams.set('redirect',relative);
    location.replace(target.href);
  }

  if(!user){
    redirectToLogin();
    return;
  }

  const roleLabel=user.role==='direction'?'Direction':'Employé';
  const initial=(user.name||'?').trim().charAt(0).toUpperCase();

  function logout(){
    sessionStorage.removeItem('jarvis-session');
    sessionStorage.removeItem('jarvis-booted');
    location.replace(loginUrl.href);
  }

  function addStyles(){
    if(document.getElementById('mavikSessionStyle'))return;
    const style=document.createElement('style');
    style.id='mavikSessionStyle';
    style.textContent=`
      .mavik-session-ui{display:flex;align-items:center;gap:10px;min-height:46px;padding:5px 7px 5px 12px;border:1px solid rgba(39,111,139,.72);border-radius:13px;background:linear-gradient(180deg,rgba(7,31,44,.96),rgba(4,18,27,.96));box-shadow:0 0 22px rgba(0,216,255,.08)}
      .mavik-session-clock{min-width:102px;text-align:right;padding-right:10px;border-right:1px solid rgba(54,111,134,.55)}
      .mavik-session-clock strong{display:block;color:#efffff;font-size:1.18rem;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.7px;text-shadow:0 0 12px rgba(0,216,255,.38)}
      .mavik-session-clock small{display:block;color:#79b7cc;font-size:.58rem;text-transform:uppercase;margin-top:4px}
      .mavik-session-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,#19506a,#091b27);color:#fff;border:1px solid #2d718c}
      .mavik-session-person{line-height:1.05}.mavik-session-person strong{display:block;font-size:.78rem}.mavik-session-person small{display:block;color:#8faaba;font-size:.62rem;margin-top:4px}
      .mavik-session-logout{border:1px solid #245168;background:#071722;color:#dff5ff;border-radius:9px;padding:8px 9px;cursor:pointer;font-size:.7rem}
      @media(max-width:760px){.mavik-session-ui{gap:7px;padding-left:8px}.mavik-session-clock{min-width:76px;padding-right:7px}.mavik-session-clock strong{font-size:1rem}.mavik-session-clock small,.mavik-session-person{display:none}.mavik-session-avatar{width:31px;height:31px}.mavik-session-logout{padding:7px;font-size:0}.mavik-session-logout:after{content:'↪';font-size:1rem}}
    `;
    document.head.appendChild(style);
  }

  function updateClock(){
    const now=new Date();
    document.querySelectorAll('[data-mavik-clock]').forEach(node=>node.textContent=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
    document.querySelectorAll('[data-mavik-date]').forEach(node=>node.textContent=now.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'}).replace('.',''));
  }

  function mount(){
    addStyles();
    document.documentElement.dataset.mavikUser=user.id;
    document.documentElement.dataset.mavikRole=user.role;
    document.querySelectorAll('[data-mavik-user]').forEach(node=>node.textContent=user.name);
    document.querySelectorAll('[data-mavik-role]').forEach(node=>node.textContent=roleLabel);
    document.querySelectorAll('[data-mavik-avatar]').forEach(node=>node.textContent=initial);
    document.querySelectorAll('[data-mavik-session-slot]').forEach(slot=>{
      if(slot.dataset.mavikMounted==='1')return;
      slot.dataset.mavikMounted='1';
      slot.innerHTML=`<div class="mavik-session-ui" aria-label="Session MAVIK"><div class="mavik-session-clock"><strong data-mavik-clock>--:--:--</strong><small data-mavik-date>Chargement…</small></div><div class="mavik-session-avatar">${initial}</div><div class="mavik-session-person"><strong>${user.name}</strong><small>${roleLabel}</small></div><button class="mavik-session-logout" type="button" title="Déconnexion">Déconnexion</button></div>`;
      slot.querySelector('.mavik-session-logout')?.addEventListener('click',logout);
    });
    updateClock();
    setInterval(updateClock,1000);
    document.dispatchEvent(new CustomEvent('mavik:session-ready',{detail:{user}}));
  }

  window.MavikSession={user,root:root.href,logout};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
