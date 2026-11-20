'use strict';
// GentleCarE — Prévisionnel de trésorerie. Simulation et saisie manuelle, non connexion bancaire.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FILE=path.join(__dirname,'data','finance-treasury.json');
const DAY=86400000;
const iso=d=>new Date(d).toISOString().slice(0,10);
const today=()=>iso(new Date());
const defaults=()=>({settings:{openingBalanceCents:null,openingDate:today(),lastReconciledAt:null},entries:[],audit:[]});
function read(){if(!fs.existsSync(FILE))return defaults();const raw=JSON.parse(fs.readFileSync(FILE,'utf8'));return{settings:{...defaults().settings,...(raw.settings||{})},entries:Array.isArray(raw.entries)?raw.entries:[],audit:Array.isArray(raw.audit)?raw.audit:[]};}
function write(db){fs.mkdirSync(path.dirname(FILE),{recursive:true});const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2),'utf8');fs.renameSync(tmp,FILE);}
function error(msg,status=400){throw Object.assign(new Error(msg),{status});}
function finiteMoney(v){const n=Number(v);if(!Number.isFinite(n)||Math.abs(n)>100000000)return error('FINANCE_AMOUNT_INVALID');return Math.round(n*100);}
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))||!Number.isFinite(Date.parse(s+'T12:00:00Z')))return error('FINANCE_DATE_INVALID');return s;}
function requireDirection(user){if(!['admin','associate'].includes(user.role))error('FINANCE_DIRECTION_REQUIRED',403);}
function list(user){requireDirection(user);return read();}
function settings(user,input={}){requireDirection(user);const db=read();const bal=input.openingBalance===null?null:finiteMoney(input.openingBalance);
 const openingDate=date(input.openingDate||today()); db.settings={openingBalanceCents:bal,openingDate,lastReconciledAt:new Date().toISOString()};db.audit.unshift({at:new Date().toISOString(),by:user.id,action:'opening-balance-updated'});write(db);return db.settings;}
function entry(user,input={}){requireDirection(user);const db=read(),kind=String(input.kind||''),status=String(input.status||'prévu'),frequency=String(input.frequency||'unique');
 if(!['entrée','sortie'].includes(kind))error('FINANCE_KIND_INVALID');
 if(!['confirmé','prévu','hypothèse'].includes(status))error('FINANCE_STATUS_INVALID');
 if(!['unique','mensuel'].includes(frequency))error('FINANCE_FREQUENCY_INVALID');
 const label=String(input.label||'').trim().slice(0,180);if(!label)error('FINANCE_LABEL_REQUIRED');
 const amountCents=finiteMoney(input.amount);if(amountCents<=0)error('FINANCE_AMOUNT_POSITIVE_REQUIRED');
 const dateStr=date(input.date);const update=String(input.id||'');const old=update?db.entries.find(e=>e.id===update):null;if(update&&!old)error('FINANCE_ENTRY_NOT_FOUND',404);
 const row={id:old?.id||crypto.randomUUID(),kind,label,amountCents,date:dateStr,status,frequency,category:String(input.category||'Autre').slice(0,70),reference:String(input.reference||'').slice(0,120),note:String(input.note||'').slice(0,500),updatedAt:new Date().toISOString(),createdAt:old?.createdAt||new Date().toISOString(),createdBy:old?.createdBy||user.id};
 if(old)db.entries[db.entries.indexOf(old)]=row;else db.entries.unshift(row);
 db.audit.unshift({at:new Date().toISOString(),by:user.id,action:old?'entry-updated':'entry-created',entryId:row.id});
 write(db);return row;}
function drop(user,id){requireDirection(user);const db=read(),old=db.entries.find(e=>e.id===id);if(!old)error('FINANCE_ENTRY_NOT_FOUND',404);db.entries=db.entries.filter(e=>e.id!==id);db.audit.unshift({at:new Date().toISOString(),by:user.id,action:'entry-deleted',entryId:id});write(db);return{removed:true};}
function addMonths(isoDate,offset){const [year,month,day]=isoDate.split('-').map(Number);const end=new Date(Date.UTC(year,month-1+offset+1,0)).getUTCDate();return iso(new Date(Date.UTC(year,month-1+offset,Math.min(day,end))));}
function expand(db,start,end){const out=[];for(const item of db.entries){let occurrences=[item.date];if(item.frequency==='mensuel'){occurrences=[];for(let n=0;n<36;n++){const d=addMonths(item.date,n);if(d>end)break;occurrences.push(d);}}
 for(const d of occurrences)if(d>=start&&d<=end)out.push({...item,date:d});}return out.sort((a,b)=>a.date.localeCompare(b.date));}
function project(user,{days=90}={}){requireDirection(user);const db=read();const beginning=db.settings.openingDate;const n=Math.min(93,Math.max(1,Number(days)||90)),end=iso(new Date(Date.parse(beginning+'T12:00:00Z')+(n-1)*DAY)),entries=expand(db,beginning,end),opening=db.settings.openingBalanceCents;
 const balances={prudent:opening,central:opening,optimiste:opening},points=[],sums={in:0,out:0};let low=null;
 for(let i=0;i<n;i++){const d=iso(new Date(Date.parse(beginning+'T12:00:00Z')+i*DAY)),items=entries.filter(x=>x.date===d);
 for(const x of items){const signed=(x.kind==='entrée'?1:-1)*x.amountCents;
 if(x.kind==='entrée')sums.in+=x.amountCents;else sums.out+=x.amountCents;
 // confirmed = included all; forecast income prudent excludes unconfirmed; central includes probable 'prévu'; optimistic includes all.
 for(const scenario of Object.keys(balances)){const included=x.status==='confirmé'||(scenario==='central'&&x.status==='prévu')||scenario==='optimiste';
 // Costs: prudent includes ALL expected outflows, central includes confirmed and planned, optimistic only confirmed outflows.
 const costIncluded=x.kind==='sortie'?(scenario==='prudent'||(scenario==='central'&&x.status!=='hypothèse')||x.status==='confirmé'):included;
 if(x.kind==='entrée'?included:costIncluded){if(balances[scenario]!==null)balances[scenario]+=signed;}}
 }
 const p={date:d,prudent:balances.prudent,central:balances.central,optimiste:balances.optimiste};points.push(p);if(p.prudent!==null)low=low===null?p.prudent:Math.min(low,p.prudent);
 }
 return{source:'Saisies manuelles Jarvis ; aucune donnée bancaire synchronisée',settings:db.settings,entries:db.entries,points,period:{start:beginning,end,days:n},summary:{openingBalanceCents:opening,expectedInCents:sums.in,expectedOutCents:sums.out,endBalances:balances,lowestPrudentCents:low,hasBankData:opening!==null},audit:db.audit.slice(0,30)};}
module.exports={list,settings,entry,drop,project};
