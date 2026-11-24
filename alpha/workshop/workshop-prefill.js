(()=>{
  const params=new URLSearchParams(location.search);
  if(params.get('new')!=='1')return;
  let payload=null;
  try{payload=JSON.parse(sessionStorage.getItem('mavik-new-intervention-prefill')||'null')}catch{}
  if(!payload)return;
  const values={newClientName:payload.clientName,newClientPhone:payload.clientPhone,newClientEmail:payload.clientEmail,newVehicleName:payload.vehicleName,newRegistration:payload.registration};
  let attempts=0;
  const apply=()=>{
    attempts++;
    let ready=true;
    Object.entries(values).forEach(([id,value])=>{
      const field=document.getElementById(id);
      if(!field){ready=false;return;}
      if(value&&!field.value){field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    if(ready){sessionStorage.removeItem('mavik-new-intervention-prefill');const request=document.getElementById('newClientRequest');if(request&&!request.value)request.focus();return;}
    if(attempts<30)setTimeout(apply,100);
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>setTimeout(apply,100),{once:true}):setTimeout(apply,100);
})();
