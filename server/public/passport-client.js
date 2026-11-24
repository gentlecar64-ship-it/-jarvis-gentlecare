'use strict';

const list=document.getElementById('list');
const status=document.getElementById('status');
const input=document.getElementById('interventionId');
const button=document.getElementById('generate');

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function api(url,options={}){const response=await fetch(url,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`HTTP_${response.status}`);return body;}
function render(records=[]){list.innerHTML=records.length?records.map((item)=>`<article class="card"><h3>${escapeHtml(item.title||item.passportNumber||'Passeport Patrimoine')}</h3><div class="meta">${escapeHtml(item.status||'Brouillon à valider')} · ${item.generatedAt?new Date(item.generatedAt).toLocaleString('fr-FR'):'Date non renseignée'}</div><div class="actions">${item.htmlUrl||item.url?`<a href="${escapeHtml(item.htmlUrl||item.url)}" target="_blank" rel="noopener">Ouvrir</a>`:''}${item.jsonUrl?`<a href="${escapeHtml(item.jsonUrl)}" target="_blank" rel="noopener">Données</a>`:''}</div></article>`).join(''):'<article class="card"><h3>Aucun Passeport</h3><div class="meta">Générez le premier document à partir d’une intervention.</div></article>';}
async function load(){try{const data=await api('/api/passports');render(data.records||[]);}catch(error){status.textContent=`Chargement impossible : ${error.message}`;}}
button.addEventListener('click',async()=>{const interventionId=input.value.trim();if(!interventionId){status.textContent='Renseignez l’identifiant de l’intervention.';return;}button.disabled=true;status.textContent='Génération du Passeport en cours…';try{const result=await api('/api/passports/generate',{method:'POST',body:JSON.stringify({interventionId})});status.innerHTML=`Passeport créé. <a href="${escapeHtml(result.htmlUrl)}" target="_blank" rel="noopener" style="color:#c6ae78">Ouvrir le document</a>`;input.value='';await load();}catch(error){status.textContent=`Échec : ${error.message}`;}finally{button.disabled=false;}});
load();
