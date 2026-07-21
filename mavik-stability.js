(()=>{
  const script=document.currentScript;
  const root=new URL('./',script?.src||location.href);
  const url=path=>new URL(path,root).href;
  const VERSION='0.39.1';
  let errorShown=false;

  function css(){
    if(document.getElementById('mavik-stability-style'))return;
    const style=document.createElement('style');
    style.id='mavik-stability-style';
    style.textContent=`
      #mavik-stability-tools{position:fixed;right:14px;bottom:14px;z-index:999990;display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;max-width:min(430px,calc(100vw - 28px));font-family:Inter,system-ui,sans-serif}
      #mavik-stability-tools a{border:1px solid #266079;border-radius:999px;background:#082333;color:#effaff;padding:9px 12px;text-decoration:none;cursor:pointer;box-shadow:0 10px 28px #0008;font:700 .72rem Inter,system-ui,sans-serif}
      #mavik-stability-tools a:first-child{border-color:#4a9160;background:#205b38}
      #mavik-error-banner{position:fixed;left:14px;right:14px;top:14px;z-index:999999;border:1px solid #a86d28;border-radius:13px;background:#2a1c0b;color:#fff4d7;padding:12px 48px 12px 15px;box-shadow:0 18px 45px #0009;font:600 .8rem Inter,system-ui,sans-serif}
      #mavik-error-banner strong{display:block;margin-bottom:4px}#mavik-error-banner a{color:#9eeeff}#mavik-error-banner button{position:absolute;right:10px;top:8px;border:0;background:none;color:white;font-size:1.35rem;cursor:pointer}
      @media(max-width:620px){#mavik-stability-tools{bottom:76px}}
    `;
    document.head.appendChild(style);
  }

  function tools(){
    if(document.getElementById('mavik-stability-tools'))return;
    const box=document.createElement('div');
    box.id='mavik-stability-tools';
    box.innerHTML=`<a href="${url('ameliorations.html')}">💡 Idée / amélioration</a><a href="${url('update.html')}">↻ Mise à jour</a>`;
    document.body.appendChild(box);
  }

  function banner(reason){
    if(errorShown||!document.body)return;
    errorShown=true;
    const el=document.createElement('div');
    el.id='mavik-error-banner';
    el.innerHTML=`<strong>MAVIK a détecté une erreur sans bloquer la page.</strong>${String(reason||'Erreur de module').replace(/[<>&]/g,'')} · <a href="${url('diagnostic.html')}">Diagnostic</a> · <a href="${url('update.html')}">Mise à jour</a><button type="button" aria-label="Fermer">×</button>`;
    el.querySelector('button').onclick=()=>el.remove();
    document.body.appendChild(el);
  }

  async function versionCheck(){
    try{
      const response=await fetch(url('version.json')+'?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)return;
      const remote=await response.json();
      document.documentElement.dataset.mavikVersion=remote.version||VERSION;
    }catch{}
  }

  function start(){
    document.getElementById('mavik-rescue')?.remove();
    css();
    tools();
    versionCheck();
  }

  window.addEventListener('error',event=>banner(event.error?.message||event.message));
  window.addEventListener('unhandledrejection',event=>banner(event.reason?.message||String(event.reason||'Erreur asynchrone')));
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
