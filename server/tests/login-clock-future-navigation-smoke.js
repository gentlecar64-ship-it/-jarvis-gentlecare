'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function checkInlineScripts(file, html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
  assert.ok(scripts.length, `${file} must contain inline JavaScript`);
  scripts.forEach((source, index) => new vm.Script(source, { filename: `${file}#inline-${index + 1}` }));
}

const onlineHome = read('index.html');
const localLogin = read('server/public/login.template.html');
const localDashboard = read('server/public/alpha.template.html');

for (const [file, html] of [
  ['index.html', onlineHome],
  ['server/public/login.template.html', localLogin],
  ['server/public/alpha.template.html', localDashboard]
]) checkInlineScripts(file, html);

assert.match(onlineHome, /Choisissez votre profil/);
assert.match(onlineHome, /if\(pin\.value!==a\.pin\)return alert\('Code incorrect\.'/);
assert.match(onlineHome, /async function playMavikStartupSound/);
assert.match(onlineHome, /await playMavikStartupSound\(\);if\(a\.role/);
assert.match(onlineHome, /id="liveClock"/);
assert.match(onlineHome, /data-future="Vision IA"/);
assert.match(onlineHome, /data-future="API & intégrations"/);

assert.match(localLogin, /Compte utilisateur/);
assert.match(localLogin, /Code personnel à 4 chiffres/);
assert.match(localLogin, /if\(!check\.ok\)throw new Error\('SESSION_NOT_CREATED'\)/);
assert.match(localLogin, /await playMavikStartupSound\(\);location\.replace/);

assert.match(localDashboard, /id="liveClock"/);
assert.match(localDashboard, /href="\/workshop"/);
assert.match(localDashboard, /href="\/planning"/);
assert.match(localDashboard, /data-future="Qualité & audit"/);
assert.match(localDashboard, /data-release="V3"/);

console.log('Login, startup sound, clock and future navigation smoke test passed.');
