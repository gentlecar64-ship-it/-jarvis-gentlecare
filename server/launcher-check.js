'use strict';

const http = require('node:http');
const os = require('node:os');
const net = require('node:net');

const PORT = Number(process.env.GCOS_PORT || 4782);
const HOST = '127.0.0.1';

function networkUrls() {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal || address.address.startsWith('169.254.')) continue;
      urls.push(`http://${address.address}:${PORT}/iphone`);
    }
  }
  return [...new Set(urls)];
}

function probePort() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    socket.setTimeout(1200);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

function probeHealth() {
  return new Promise((resolve) => {
    const request = http.get({ hostname: HOST, port: PORT, path: '/health', timeout: 1800 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ ok: response.statusCode === 200 && /MAVIK GCOS/i.test(String(payload.service || '')), payload });
        } catch {
          resolve({ ok: false, payload: null });
        }
      });
    });
    request.once('timeout', () => { request.destroy(); resolve({ ok: false, payload: null }); });
    request.once('error', () => resolve({ ok: false, payload: null }));
  });
}

(async () => {
  console.log('Acces sur ce PC :');
  console.log(`  http://localhost:${PORT}/alpha`);
  console.log('');
  console.log('Acces iPhone sur le meme Wi-Fi :');
  const urls = networkUrls();
  if (urls.length) urls.forEach((url) => console.log(`  ${url}`));
  else console.log('  Adresse IP non detectee - verifiez le Wi-Fi');
  console.log('');

  if (!(await probePort())) process.exit(0);

  const health = await probeHealth();
  if (health.ok) {
    console.log(`MAVIK est deja en fonctionnement sur le port ${PORT}.`);
    console.log(`Version active : ${health.payload?.version || 'inconnue'}`);
    console.log('Aucun second serveur ne sera lance.');
    process.exit(10);
  }

  console.error(`Le port ${PORT} est utilise par un autre programme.`);
  console.error('MAVIK ne redemarrera pas en boucle. Fermez le programme concerne ou lancez REPARER-MAVIK.cmd en administrateur.');
  process.exit(11);
})().catch((error) => {
  console.error('[MAVIK LAUNCHER]', error.message || error);
  process.exit(12);
});
