(()=>{
  const VERSION='0.36.0';
  const steps=['SYSTÈME','DONNÉES','ATELIER','JARVIS'];

  const css=document.createElement('link');
  css.rel='stylesheet';
  css.href='jarvis-responsive.css?v=16';
  document.head.appendChild(css);

  function requestedRedirect(){
    const raw=new URLSearchParams(location.search).get('redirect');
    if(!raw)return null;
    try{
      const root=new URL('./',location.href);
      const target=new URL(raw,root);
      if(target.origin!==location.origin||!target.pathname.startsWith(root.pathname))return null;
      if(target.pathname===root.pathname||target.pathname.endsWith('/index.html'))return null;
      return target.href;
    }catch{return null}
  }

  function activeUser(){
    try{
      const session=JSON.parse(sessionStorage.getItem('jarvis-session')||'null');
      const accounts=JSON.parse(localStorage.getItem('jarvis-accounts')||'[]');
      return accounts.find(account=>account.id===session?.id)||null;
    }catch{return null}
  }

  function applyVersion(){
    const version=document.querySelector('.version');
    if(version)version.innerHTML=`MAVIK GCOS v${VERSION} · <span class="dot"></span> Système actif`;
  }

  function followRedirect(){
    const target=requestedRedirect();
    const user=activeUser();
    if(target&&user?.role==='direction')location.replace(target);
  }

  function wrapLogin(){
    if(typeof window.openSession!=='function'||window.openSession.__mavikWrapped)return;
    const original=window.openSession;
    const wrapped=async function(account){
      await original(account);
      const target=requestedRedirect();
      if(target&&account?.role==='direction')location.replace(target);
    };
    wrapped.__mavikWrapped=true;
    window.openSession=wrapped;
  }

  function ensureBoot(){
    applyVersion();
    wrapLogin();
    followRedirect();
    if(sessionStorage.getItem('jarvis-booted'))return;
    const layer=document.createElement('div');
    layer.id='jarvisBoot';
    layer.innerHTML=`<style>
      #jarvisBoot{position:fixed;inset:0;z-index:99999;background:radial-gradient(circle at 50% 42%,#0a3040 0,#031018 42%,#010407 100%);display:grid;place-items:center;color:white;font-family:system-ui;overflow:hidden}
      #jarvisBoot .orb{width:112px;height:112px;border:2px solid #26d9f4;border-radius:50%;box-shadow:0 0 35px #26d9f477,inset 0 0 32px #57f06a33;display:grid;place-items:center;animation:pulse 1.1s infinite alternate;font-size:42px}
      #jarvisBoot .ring{position:absolute;width:160px;height:160px;border:1px solid #57f06a66;border-radius:50%;animation:spin 3s linear infinite}
      #jarvisBoot h1{font-size:28px;margin:20px 0 4px;letter-spacing:.16em}
      #jarvisBoot p{margin:0 0 12px;color:#9fb5be;font-size:12px;letter-spacing:.08em}
      #jarvisBoot .status{min-height:20px;color:#57f06a;font-weight:800;font-size:12px;letter-spacing:.12em}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes pulse{to{transform:scale(1.04);box-shadow:0 0 58px #26d9f4aa,inset 0 0 42px #57f06a55}}
    </style><div style="text-align:center;position:relative"><div class="ring"></div><div class="orb">J</div><h1>JARVIS</h1><p>GENTLECARE OPERATIONS SYSTEM</p><div class="status" id="jarvisBootStatus">INITIALISATION</div></div>`;
    document.body.appendChild(layer);
    let index=0;
    const status=layer.querySelector('#jarvisBootStatus');
    const tick=()=>{
      status.textContent=steps[index]+' — OK';
      index++;
      if(index<steps.length)setTimeout(tick,260);
      else setTimeout(()=>{
        sessionStorage.setItem('jarvis-booted','1');
        layer.animate([{opacity:1},{opacity:0}],{duration:420,fill:'forwards'}).onfinish=()=>layer.remove();
      },380);
    };
    setTimeout(tick,180);
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ensureBoot,{once:true}):ensureBoot();
})();
