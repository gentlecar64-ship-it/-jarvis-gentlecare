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
      if(!deferredPrompt) return false;
      deferredPrompt.prompt();
      const result=await deferredPrompt.userChoice;
      deferredPrompt=null;
      return result.outcome==='accepted';
    },
    available(){return !!deferredPrompt;}
  };

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(refreshing) return;
      refreshing=true;
      location.reload();
    });

    window.addEventListener('load',async()=>{
      try{
        const registration=await navigator.serviceWorker.register('./service-worker.js?v=14');
        await registration.update();
        setInterval(()=>registration.update().catch(()=>{}),5*60*1000);
      }catch(error){
        console.error('Jarvis PWA:',error);
      }
    });
  }
})();