(()=>{
  const script=document.currentScript;
  const root=new URL('./',script?.src||location.href);
  const url=path=>new URL(path,root).href;
  const VERSION='0.39.0';
  let errorShown=false;

  function css(){
    if(document.getElementById('mavik-stability-style'))return;
    const style=document.createElement('style');
    style.id='mavik-stability-style';
    style.textContent=`
      #mavik-stability-tools{position:fixed;right:14px;bottom:14px;z-index:999990;display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;max-width:min(430px,calc(100vw - 28px));font-family:Inter,system-ui,sans-serif}
      #mavik-stability-tools a,#mavik-stability-tools button{border:1px solid #266079;border-radius:999px;background:#082333;color:#effaff;padding:9px 12px;text-decoration:none;cursor:pointer;box-shadow:0 10px 28px #0008;font:700 .72rem Inter,system-ui,sans-serif}
      #mavik-stability-tools a:first-child{border-color:#4a9160;background:#205b38}
      #mavik-error-banner{position:fixed;left:14px;right:14px;top:14px;z-index:999999;border:1px solid #a86d28;border-radius:13px;background:#2a1c0b;color:#fff4d7;padding:12px 15px;box-shadow:0 18px 45px #0009;font:600 .8rem Inter,system-ui,sans-serif}
      #mavik-error-banner strong{display:block;margin-bottom:4px}#mavik-error-banner a{color:#9eeeff}
      #mavik-rescue{position:fixed;inset:0;z-index:999998;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at 50% 0,#0b3a4c,#031019 56%);color:#f5fbff;font-family:Inter,system-ui,sans-serif}
      #mavik-rescue>div{width:min(720px,100%);border:1px solid #266079;border-radius:20px;background:#071a27;padding:22px;box-shadow:0 25px 80px #0009}#mavik-rescue h1{margin-top:0}#mavik-rescue p{color:#a6c0cb}
      #mavik-rescue nav{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:18px}#mavik-rescue a,#mavik-rescue button{border:1px solid #286079;border-radius:11px;background:#0a2635;color:#fff;padding:12px;text-align:center;text-decoration:none;cursor:pointer;font:inherit}#mavik-rescue a.primary{background:#28603d;border-color:#4c9863;font-weight:900}
      @media(max-width:620px){#mavik-stability-tools{bottom:76px}#mavik-rescue nav{grid-template-columns:1fr}}
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

  function hasUsefulContent(){
    const bodyText=(document.body?.innerText||'').replace(/\s+/g,' ').trim();
    const visible=[...(document.body?.children||[])].some(el=>{
      if(['SCRIPT','STYLE','LINK'].includes(el.tagName)||['mavik-stability-tools','mavik-error-banner'].includes(el.id))return false;
      const s=getComputedStyle(el);
      return s.display!=='none'&&s.visibility!=='hidden'&&el.getBoundingClientRect().height>20;
    });
    return bodyText.length>20&&visible;
  }

  function banner(reason){
    if(errorShown||!document.body)return;
    errorShown=true;
    const el=document.createElement('div');
    el.id='mavik-error-banner';
    el.innerHTML=`<strong>MAVIK a détecté une erreur sans fermer la page.</strong>${String(reason||'Erreur de module').replace(/[<>&]/g,'')} · <a href="${url('update.html')}">Réparer / mettre à jour</a>`;
    document.body.appendChild(el);
  }

  function rescue(reason){
    if(document.getElementById('mavik-rescue')||!document.body)return;
    const layer=document.createElement('section');
    layer.id='mavik-rescue';
    layer.innerHTML=`<div><h1>MAVIK GCOS</h1><h2>Interface de secours opérationnelle</h2><p>La page demandée n’a pas affiché son module principal. Vos données locales ne sont pas supprimées. Utilisez les accès ci-dessous ou lancez la mise à jour.</p><p><strong>Diagnostic :</strong> ${String(reason||'contenu non visible').replace(/[<>&]/g,'')}</p><nav><a class="primary" href="${url('index.html')}">Accueil</a><a href="${url('alpha/workshop/index.html')}">Poste atelier</a><a href="${url('planning.html')}">Planning</a><a href="${url('gestion.html')}">Gestion</a><a href="${url('ameliorations.html')}">Dossier améliorations</a><a href="${url('update.html')}">Installer la mise à jour</a></nav></div>`;
    document.body.appendChild(layer);
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
    css();
    tools();
    versionCheck();
    setTimeout(()=>{if(!hasUsefulContent())rescue('La page est vide ou son contenu est masqué.');},900);
  }

  window.addEventListener('error',event=>banner(event.error?.message||event.message));
  window.addEventListener('unhandledrejection',event=>banner(event.reason?.message||String(event.reason||'Erreur asynchrone')));
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
