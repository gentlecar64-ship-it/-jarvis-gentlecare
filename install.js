(()=>{
  let deferredPrompt=null;
  let refreshing=false;

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    document.dispatchEvent(new CustomEvent('jarvis-install-ready'));
  });

  window.JarvisInstall={
    async prompt(){
      if(!deferredPrompt)return false;
      deferredPrompt.prompt();
      const result=await deferredPrompt.userChoice;
      deferredPrompt=null;
      return result.outcome==='accepted';
    },
    available(){return !!deferredPrompt;}
  };

  if(!('serviceWorker' in navigator))return;

  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing)return;
    refreshing=true;
    location.reload();
  });

  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./service-worker.js?v=3800',{updateViaCache:'none'});
      await registration.update();
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller)worker.postMessage({type:'SKIP_WAITING'});
        });
      });
      setInterval(()=>registration.update().catch(()=>{}),2*60*1000);
    }catch(error){
      console.error('MAVIK PWA:',error);
    }
  });
})();