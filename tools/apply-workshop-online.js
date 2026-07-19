'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function file(name) { return path.join(root, name); }
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`Patch target missing: ${label}`);
  return content.replace(before, after);
}
function write(name, content) { fs.writeFileSync(file(name), content, 'utf8'); }

let server = fs.readFileSync(file('server/server.js'), 'utf8');
server = replaceOnce(server,
  "const workshopProcedures = require('./workshop-procedures');",
  "const workshopProcedures = require('./workshop-procedures');\nconst workshop = require('./workshop-service');",
  'workshop import');
server = replaceOnce(server,
  "const HOME_PAGES = new Set(['dashboard', 'jarvis', 'quotes', 'planning', 'profile']);",
  "const HOME_PAGES = new Set(['dashboard', 'jarvis', 'quotes', 'planning', 'workshop', 'profile']);",
  'home pages');
server = replaceOnce(server,
  "const protectedPages = ['/', '/alpha', '/iphone', '/jarvis', '/profile', '/quotes', '/planning'];",
  "const protectedPages = ['/', '/alpha', '/iphone', '/jarvis', '/profile', '/quotes', '/planning', '/workshop'];",
  'protected pages');
server = replaceOnce(server,
  "'quote-studio-client.js', 'planning-client.js', 'morale-client.js'",
  "'quote-studio-client.js', 'planning-client.js', 'workshop-client.js', 'morale-client.js'",
  'asset list');
server = replaceOnce(server,
  "if (req.method === 'GET' && url.pathname === '/planning') { auth.requirePermission(user, 'interventions.read'); return servePage(res, 'planning.html', 'Planning introuvable', true); }",
  "if (req.method === 'GET' && url.pathname === '/planning') { auth.requirePermission(user, 'interventions.read'); return servePage(res, 'planning.html', 'Planning introuvable', true); }\n    if (req.method === 'GET' && url.pathname === '/workshop') { auth.requirePermission(user, 'interventions.read'); return servePage(res, 'workshop.html', 'Atelier introuvable', true); }",
  'workshop page route');
server = replaceOnce(server,
  "emergencyAlert: { enabled: true, synchronized: true }, employeeFlow: { enabled: true }",
  "workshopOnline: { enabled: true, acceptedQuoteCreatesFile: true, depositRequiredToStart: true, directionFinalValidation: true }, emergencyAlert: { enabled: true, synchronized: true }, employeeFlow: { enabled: true }",
  'health workshop');
server = replaceOnce(server,
  "if (req.method === 'GET' && url.pathname === '/api/workshop/procedures') return json(res, 200, { records: workshopProcedures.list() });",
  `if (req.method === 'GET' && url.pathname === '/api/workshop/procedures') return json(res, 200, { records: workshopProcedures.list() });
    if (req.method === 'GET' && url.pathname === '/api/workshop/overview') { auth.requirePermission(user, 'interventions.read'); return json(res, 200, workshop.overview(localStore, user)); }
    if (req.method === 'POST' && url.pathname === '/api/workshop/restore') { if (!['admin', 'associate'].includes(user.role)) throw Object.assign(new Error('WORKSHOP_DIRECTION_REQUIRED'), { status: 403 }); return json(res, 200, workshop.restoreAcceptedQuotes(localStore, user)); }
    const workshopDetailRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)$/);
    if (workshopDetailRoute && req.method === 'GET') { auth.requirePermission(user, 'interventions.read'); return json(res, 200, workshop.detail(localStore, decodeURIComponent(workshopDetailRoute[1]), user)); }
    const workshopAssignRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/assign$/);
    if (workshopAssignRoute && req.method === 'POST') { auth.requirePermission(user, 'interventions.write'); return json(res, 200, { intervention: workshop.assign(localStore, decodeURIComponent(workshopAssignRoute[1]), await readBody(req), user) }); }
    const workshopReceptionRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/reception$/);
    if (workshopReceptionRoute && req.method === 'POST') { auth.requirePermission(user, 'interventions.write'); return json(res, 200, { intervention: workshop.reception(localStore, decodeURIComponent(workshopReceptionRoute[1]), await readBody(req), user) }); }
    const workshopWorkRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/work-action$/);
    if (workshopWorkRoute && req.method === 'POST') { auth.requirePermission(user, 'interventions.write'); return json(res, 200, workshop.workAction(localStore, decodeURIComponent(workshopWorkRoute[1]), await readBody(req), user)); }
    const workshopStepRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/steps\\/([^/]+)$/);
    if (workshopStepRoute && req.method === 'PATCH') { auth.requirePermission(user, 'interventions.write'); return json(res, 200, { intervention: workshop.updateStep(localStore, decodeURIComponent(workshopStepRoute[1]), decodeURIComponent(workshopStepRoute[2]), await readBody(req), user) }); }
    const workshopEvidenceRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/steps\\/([^/]+)\\/evidence$/);
    if (workshopEvidenceRoute && req.method === 'POST') { auth.requirePermission(user, 'interventions.write'); return json(res, 201, workshop.saveEvidence(localStore, decodeURIComponent(workshopEvidenceRoute[1]), decodeURIComponent(workshopEvidenceRoute[2]), await readBody(req), user)); }
    const workshopFinalRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/request-final$/);
    if (workshopFinalRoute && req.method === 'POST') { auth.requirePermission(user, 'interventions.write'); return json(res, 200, { intervention: workshop.requestFinalValidation(localStore, decodeURIComponent(workshopFinalRoute[1]), await readBody(req), user) }); }
    const workshopApproveRoute = url.pathname.match(/^\\/api\\/workshop\\/interventions\\/([^/]+)\\/approve-final$/);
    if (workshopApproveRoute && req.method === 'POST') {
      const approved = workshop.approveFinal(localStore, decodeURIComponent(workshopApproveRoute[1]), await readBody(req), user);
      const completion = quoteWorkflow.transition(localStore, approved.quoteId, 'complete', {}, user);
      return json(res, 200, { intervention: workshop.detail(localStore, approved.id, user), completion });
    }`,
  'workshop API routes');
const oldTransition = "if (quoteTransitionRoute && req.method === 'POST') { auth.requirePermission(user, 'quotes.write'); const body = await readBody(req); const result = quoteWorkflow.transition(localStore, decodeURIComponent(quoteTransitionRoute[1]), body.action, body, user); if (body.action === 'close') result.data.reputation = reputation.scheduleClientReview(localStore, result.data.quote, user); return json(res, 200, result); }";
const newTransition = `if (quoteTransitionRoute && req.method === 'POST') {
      auth.requirePermission(user, 'quotes.write');
      const reference = decodeURIComponent(quoteTransitionRoute[1]);
      const body = await readBody(req);
      if (body.action === 'start') workshop.validateStart(localStore, quoteWorkflow.resolveQuote(localStore, reference)?.interventionId || '', user);
      if (body.action === 'complete') workshop.assertCompletable(localStore, quoteWorkflow.resolveQuote(localStore, reference)?.interventionId || '', user);
      const result = quoteWorkflow.transition(localStore, reference, body.action, body, user);
      if (body.action === 'accept') {
        const prepared = workshop.prepareAcceptedQuote(localStore, result.data.quote, user);
        result.data.quote = prepared.quote;
        result.data.intervention = prepared.intervention;
        result.answer += ' Le dossier atelier et sa procédure sont maintenant préparés en ligne.';
      }
      if (body.action === 'deposit-received') {
        const unlocked = workshop.unlockAfterDeposit(localStore, result.data.quote, user);
        result.data.quote = unlocked.quote;
        result.data.intervention = unlocked.intervention;
        result.answer += ' La procédure atelier est déverrouillée.';
      }
      if (body.action === 'close') result.data.reputation = reputation.scheduleClientReview(localStore, result.data.quote, user);
      return json(res, 200, result);
    }`;
server = replaceOnce(server, oldTransition, newTransition, 'quote transition workshop hook');
server = replaceOnce(server,
  "backup.startAutomaticBackups();",
  "const restoredWorkshopFiles = workshop.restoreAcceptedQuotes(localStore, { name: 'MAVIK', role: 'admin' });\nbackup.startAutomaticBackups();",
  'restore accepted workshop files');
server = replaceOnce(server,
  "console.log('Workshop procedures: separate automobile and motorcycle checklists enabled');",
  "console.log(`Workshop online: ${restoredWorkshopFiles.total} accepted quote(s) checked; procedures, evidence and final validation enabled`);\n  console.log('Workshop procedures: separate automobile and motorcycle checklists enabled');",
  'startup workshop log');
write('server/server.js', server);

const packagePath = file('server/package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = '0.26.0-alpha.1';
if (!pkg.scripts.check.includes('workshop-service.js')) pkg.scripts.check = pkg.scripts.check.replace('workshop-procedures.js', 'workshop-procedures.js && node --check workshop-service.js');
if (!pkg.scripts.check.includes('public/workshop-client.js')) pkg.scripts.check = pkg.scripts.check.replace('public/planning-client.js', 'public/planning-client.js && node --check public/workshop-client.js');
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

let nav = fs.readFileSync(file('server/public/navigation-enhancer.js'), 'utf8');
nav = replaceOnce(nav,
  "  }\n\n  if (document.readyState === 'loading')",
  `    const sideNavWorkshop = document.querySelector('.side .nav');
    if (sideNavWorkshop && !sideNavWorkshop.querySelector('a[href="/workshop"]')) {
      const link = document.createElement('a'); link.href = '/workshop'; link.innerHTML = '<b>🛠</b>Atelier';
      const planning = sideNavWorkshop.querySelector('a[href="/planning"]');
      (planning || sideNavWorkshop.lastElementChild)?.insertAdjacentElement('afterend', link);
    }
    const mobileWorkshop = document.querySelector('.mobile');
    if (mobileWorkshop && !mobileWorkshop.querySelector('a[href="/workshop"]')) {
      const link = document.createElement('a'); link.href = '/workshop'; link.innerHTML = '<b>🛠</b>Atelier'; mobileWorkshop.prepend(link);
    }
    const heroWorkshop = document.querySelector('.hero-buttons');
    if (heroWorkshop && !heroWorkshop.querySelector('a[href="/workshop"]')) {
      const link = document.createElement('a'); link.href = '/workshop'; link.className = 'button'; link.textContent = 'Ouvrir l’atelier'; heroWorkshop.appendChild(link);
    }
    const quickWorkshop = document.querySelector('.quick');
    if (quickWorkshop && !quickWorkshop.querySelector('a[href="/workshop"]')) {
      const link = document.createElement('a'); link.href = '/workshop'; link.className = 'button'; link.textContent = '🛠 Procédure atelier'; quickWorkshop.prepend(link);
    }
  }

  if (document.readyState === 'loading')`,
  'navigation workshop links');
write('server/public/navigation-enhancer.js', nav);

let workflow = fs.readFileSync(file('.github/workflows/validate.yml'), 'utf8');
if (!workflow.includes('Workshop online procedure smoke test')) workflow = workflow.replace('      - name: Command dock internal messaging smoke test\n        run: node tests/command-dock-messaging-smoke.js', '      - name: Command dock internal messaging smoke test\n        run: node tests/command-dock-messaging-smoke.js\n      - name: Workshop online procedure smoke test\n        run: node tests/workshop-online-smoke.js');
write('.github/workflows/validate.yml', workflow);

for (const disposable of ['tools/apply-workshop-online.js', '.github/workflows/apply-workshop-online.yml']) {
  try { fs.unlinkSync(file(disposable)); } catch {}
}
console.log('Workshop online integration applied.');
