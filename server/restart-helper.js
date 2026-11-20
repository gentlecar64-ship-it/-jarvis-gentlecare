'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const parentPid = Number(process.argv[2] || 0);
const entry = process.argv[3];
const cwd = process.argv[4] || process.cwd();

function parentAlive() {
  if (!parentPid) return false;
  try { process.kill(parentPid, 0); return true; }
  catch { return false; }
}

function startServer() {
  if (!entry) process.exit(2);
  const runtime = path.join(cwd, 'premium-passport-runtime.js');
  const args = require('node:fs').existsSync(runtime) ? ['-r', runtime, entry] : [entry];
  const child = spawn(process.execPath, args, {
    cwd,
    detached: true,
    windowsHide: false,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();
  process.exit(0);
}

const deadline = Date.now() + 20000;
const timer = setInterval(() => {
  if (!parentAlive() || Date.now() >= deadline) {
    clearInterval(timer);
    setTimeout(startServer, 800);
  }
}, 300);
