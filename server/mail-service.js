'use strict';

// Gmail API OAuth : no passwords or access tokens exposed to the browser.
const fs = require('node:fs');
const path = require('node:path');
const OUTPUT = path.join(__dirname, 'data', 'outgoing-mail-log.json');
const from = () => String(process.env.GCOS_MAIL_FROM || process.env.GCOS_SMTP_USER || '').trim();
const config = () => ({
  clientId: String(process.env.GCOS_GMAIL_CLIENT_ID || ''),
  clientSecret: String(process.env.GCOS_GMAIL_CLIENT_SECRET || ''),
  refreshToken: String(process.env.GCOS_GMAIL_REFRESH_TOKEN || ''),
  from: from()
});
const configured = () => { const c=config();return Boolean(c.clientId && c.clientSecret && c.refreshToken && c.from); };
const err = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const address = value => /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(String(value||''));
function status() { return { configured: configured(), from: from() || '', provider:'Gmail OAuth', sendingEnabled: configured() }; }
async function token() {
  const c = config();
  const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({ client_id:c.clientId, client_secret:c.clientSecret, refresh_token:c.refreshToken, grant_type:'refresh_token' }), signal:AbortSignal.timeout(12000) });
  if (!r.ok) err('GMAIL_AUTH_FAILED_'+r.status, 502);
  const data=await r.json();
  if (!data.access_token) err('GMAIL_ACCESS_TOKEN_MISSING', 502);
  return data.access_token;
}
function log(event) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive:true });
  const file = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT,'utf8')) : [];
  if (!Array.isArray(file)) err('MAIL_AUDIT_INVALID', 500);
  file.push(event);
  const temp=OUTPUT+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(file.slice(-1000),null,2),{encoding:'utf8',mode:0o600});
  fs.renameSync(temp,OUTPUT);
}
async function send(input={},user={}) {
  if (!['admin','associate'].includes(user.role)) err('MAIL_DIRECTION_REQUIRED',403);
  if (input.confirmed !== true) err('MAIL_EXPLICIT_CONFIRMATION_REQUIRED',409);
  if (!configured()) err('GMAIL_NOT_CONFIGURED',503);
  const to=String(input.to||'').trim(),subject=String(input.subject||'').trim(),body=String(input.body||'').trim();
  if (!address(to) || !subject || !body || subject.length>200 || body.length>40000 || /[\r\n]/.test(subject)) err('MAIL_FIELDS_INVALID');
  const c=config();
  if (!address(c.from)) err('MAIL_FROM_INVALID',503);
  const raw=['From: GentleCarE <'+c.from+'>','To: '+to,'Subject: =?UTF-8?B?'+Buffer.from(subject,'utf8').toString('base64')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body,'utf8').toString('base64')].join('\r\n');
  const accessToken=await token();
  const result=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify({raw:Buffer.from(raw).toString('base64url')}),signal:AbortSignal.timeout(20000)});
  if (!result.ok) err('GMAIL_SEND_FAILED_'+result.status,502);
  const data=await result.json();
  if (!data.id) err('GMAIL_SEND_UNCONFIRMED',502);
  log({id:data.id,threadId:data.threadId||'',to,subject,at:new Date().toISOString(),by:user.id||user.name||'',relatedId:String(input.relatedId||'').slice(0,140)});
  return {sent:true,messageId:data.id,threadId:data.threadId||'',to,subject};
}
module.exports={status,send};
