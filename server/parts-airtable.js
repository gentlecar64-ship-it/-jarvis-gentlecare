'use strict';
// Miroir non destructif des pièces MAVIK vers la table Airtable GentleCarE.
// La fiche locale est conservée si le réseau ou l'API est indisponible.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const BASE = process.env.AIRTABLE_BASE_ID || 'app6i45G4WG2nmQff';
const TABLE = 'tblI4DlxK2dcrbY0q';
const ATTACHMENTS = 'fldnKjoUxlZm3p2t4';
const SYNC_FILE = path.join(__dirname, 'data', 'parts-airtable-sync.json');
const F = Object.freeze({name:'fldlHhPMQKQGggrZI',id:'fldLTqOawC4wRoARY',type:'fldzsLZn3mhXLXV3R',reference:'fldz9Fw4zgNUSOaHM',category:'fldqnTrRKgFMOQCn9',status:'fldLr2st3GrtGdy8D',client:'fldwpKGwrQVUngKKM',dossier:'fldnQqH0u04rn9Hrd',description:'fldIWzaCTM9B5KLsj',clientName:'fld0CTQOXoEp8Xpxt',dossierLabel:'fld34x8rI4beQZMQM',ice:'fldr8uVO7eLEH2ePe',minutes:'fldqmOiVFa3fNie1N',price:'flddxlircV3fXgepy',handoff:'fldVXFoJNRXhO50WE'});
const inFlight = new Map();
const token = () => String(process.env.AIRTABLE_TOKEN || '').trim();
const enabled = () => Boolean(token() && process.env.GCOS_PARTS_AIRTABLE_SYNC !== 'false');
function load() { try { const x=JSON.parse(fs.readFileSync(SYNC_FILE,'utf8'));return x&&typeof x==='object'?x:{}; } catch {return {};} }
function save(state) { fs.mkdirSync(path.dirname(SYNC_FILE),{recursive:true});const temp=SYNC_FILE+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temp,SYNC_FILE); }
function state(id) { return load()[id] || { status:enabled()?'En attente':'Non configurée' }; }
function fields(item) {
  const x = {
    [F.name]: [item.clientName,item.kind,item.name].filter(Boolean).join(' — ') || item.id,
    [F.id]: item.id,
    [F.type]: String(item.kind||''),
    [F.reference]: String(item.reference||''),
    [F.status]: String(item.status||'À traiter'),
    [F.client]: String(item.clientId||''),
    [F.dossier]: String(item.dossierId||''),
    [F.description]: String(item.description||'').slice(0,4000),
    [F.clientName]: String(item.clientName||''),
    [F.dossierLabel]: String(item.dossierLabel||''),
    [F.ice]: Number(item.dryIceKg||0),
    [F.minutes]: Number(item.workMinutes||0),
    [F.price]: Number(item.amountHt||0)
  };
  if (['A','B','C'].includes(item.category)) x[F.category]=item.category;
  if (item.handoffAt) x[F.handoff]=item.handoffAt;
  return x;
}
async function request(url,options={}) {
  const r = await fetch(url,{...options,headers:{Authorization:'Bearer '+token(),...(options.headers||{})},signal:AbortSignal.timeout(18000)});
  const payload=await r.json().catch(()=>({}));
  if (!r.ok) throw new Error('AIRTABLE_'+r.status+'_'+String(payload.error?.type||payload.error?.message||'REQUEST_FAILED').slice(0,120));
  return payload;
}
function persist(id,patch) {
  const data=load(); data[id]={...(data[id]||{}),...patch,checkedAt:new Date().toISOString()};save(data);return data[id];
}
async function pushNow(item) {
  if (!enabled()) return {status:'Non configurée'};
  if (!item?.id) throw new Error('PART_ID_REQUIRED');
  const previous=state(item.id), photos=Array.isArray(item.photos)?item.photos:[];
  const hashes=photos.map(photo=>crypto.createHash('sha256').update(String(photo.data||'')).digest('hex'));
  if (previous.status==='Synchronisée' && previous.updatedAt===item.updatedAt && hashes.every(h=>(previous.uploadedHashes||[]).includes(h))) return previous;
  try {
    const result=await request('https://api.airtable.com/v0/'+BASE+'/'+TABLE,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({performUpsert:{fieldsToMergeOn:[F.id]},records:[{fields:fields(item)}]})
    });
    const recordId=result.records?.[0]?.id;
    if (!recordId) throw new Error('AIRTABLE_UPSERT_NO_RECORD_ID');
    const uploaded=new Set(previous.recordId===recordId?previous.uploadedHashes||[]:[]);
    for (let i=0;i<photos.length;i++) {
      if (uploaded.has(hashes[i])) continue;
      const photo=photos[i],match=String(photo.data||'').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) throw new Error('AIRTABLE_PART_PHOTO_INVALID');
      const ext=match[1].toLowerCase().replace('jpeg','jpg');
      const mime=ext==='jpg'?'image/jpeg':'image/'+ext;
      const filename='mavik-'+item.id+'-'+hashes[i].slice(0,12)+'.'+ext;
      await request('https://content.airtable.com/v0/'+BASE+'/'+recordId+'/'+ATTACHMENTS+'/uploadAttachment',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filename,contentType:mime,file:match[2]})
      });
      uploaded.add(hashes[i]);
      persist(item.id,{recordId,uploadedHashes:[...uploaded],status:'En cours'});
    }
    return persist(item.id,{recordId,uploadedHashes:[...uploaded],updatedAt:item.updatedAt,status:'Synchronisée',error:''});
  } catch (error) {
    return persist(item.id,{status:'En attente de nouvelle tentative',error:String(error.message||error).slice(0,200)});
  }
}
function enqueue(item) {
  if (!enabled() || !item?.id) return false;
  if (inFlight.has(item.id)) return true;
  const pending=pushNow(item).catch(error=>({status:'Erreur',error:String(error.message||error)})).finally(()=>inFlight.delete(item.id));
  inFlight.set(item.id,pending);
  return true;
}
async function retry(partService) {
  if (!enabled()) return;
  const parts=partService.list().slice(0,100);
  for (const part of parts) {
    if (inFlight.has(part.id)) continue;
    const full=partService.one(part.id);
    await pushNow(full);
  }
}
function start(partService) {
  const run=()=>retry(partService).catch(error=>console.warn('[PARTS AIRTABLE]',String(error.message||error)));
  setTimeout(run,12000).unref();
  setInterval(run,5*60*1000).unref();
}
module.exports={enabled,state,enqueue,retry,start,fields};
