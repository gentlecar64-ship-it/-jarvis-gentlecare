'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ALPHA_TEMPLATE = path.join(__dirname, 'public', 'alpha.template.html');
const ALPHA_TARGET = path.join(__dirname, 'public', 'alpha.html');
const LOGIN_TEMPLATE = path.join(__dirname, 'public', 'login.template.html');
const LOGIN_TARGET = path.join(__dirname, 'public', 'login.html');
const PARTS = path.join(__dirname, 'assets', 'logo');
let announced = false;

function iphoneUrls(port = Number(process.env.GCOS_PORT || 4782)) {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) urls.push(`http://${address.address}:${port}/iphone`);
    }
  }
  return [...new Set(urls)];
}

function announce() {
  if (announced) return;
  announced = true;
  const urls = iphoneUrls();
  console.log('Accès sur ce PC : http://localhost:4782/alpha');
  if (urls.length) {
    console.log('Accès iPhone sur le même Wi-Fi :');
    urls.forEach((url) => console.log(`  ${url}`));
  } else {
    console.log('Accès iPhone : adresse réseau non détectée. Vérifiez que le PC est connecté au Wi-Fi.');
  }
}

function logoData() {
  const files = fs.readdirSync(PARTS).filter((name) => /^\d+\.txt$/.test(name)).sort();
  if (!files.length) throw new Error('OFFICIAL_LOGO_PARTS_MISSING');
  const logo = files.map((name) => fs.readFileSync(path.join(PARTS, name), 'utf8').trim()).join('');
  if (!logo.startsWith('iVBOR')) throw new Error('OFFICIAL_LOGO_INVALID');
  return { logo, files };
}

function writeGenerated(templatePath, targetPath, logo, replacements = []) {
  let output = fs.readFileSync(templatePath, 'utf8').replaceAll('__OFFICIAL_LOGO__', logo);
  for (const [before, after] of replacements) output = output.replaceAll(before, after);
  output = output.replace('</head>', `<meta name="mavik-generated" content="${Date.now()}"></head>`);
  const temp = `${targetPath}.tmp`;
  fs.writeFileSync(temp, output, 'utf8');
  fs.renameSync(temp, targetPath);
  return output.length;
}

function install() {
  const { logo, files } = logoData();
  const urls = iphoneUrls();
  const iphoneLink = urls[0] || 'Adresse réseau non détectée : vérifiez le Wi-Fi du PC puis relancez MAVIK.';
  const alphaSize = writeGenerated(ALPHA_TEMPLATE, ALPHA_TARGET, logo, [
    ['Le lien exact s’affiche dans la fenêtre DEMARRER-MAVIK.cmd.', iphoneLink]
  ]);
  const loginSize = writeGenerated(LOGIN_TEMPLATE, LOGIN_TARGET, logo);
  announce();
  return {
    ok: true,
    parts: files.length,
    size: alphaSize + loginSize,
    target: ALPHA_TARGET,
    loginTarget: LOGIN_TARGET,
    iphoneUrls: urls
  };
}

module.exports = {
  install,
  iphoneUrls,
  announce,
  ALPHA_TEMPLATE,
  ALPHA_TARGET,
  LOGIN_TEMPLATE,
  LOGIN_TARGET,
  PARTS
};