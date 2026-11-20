'use strict';

const fs = require('node:fs');
const path = require('node:path');
const procedures = require('../server/workshop-procedures');
const airtable = require('../server/airtable-sync');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function write(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

write('workshop-procedures.json', {
  version: '1.0',
  generatedAt: '2026-07-20',
  source: 'server/workshop-procedures.js',
  records: procedures.list()
});

write('airtable-schema.json', {
  version: '1.0',
  generatedAt: '2026-07-20',
  source: 'server/airtable-sync.js',
  conflictPolicy: 'AIRTABLE_WINS_THEN_PUSH_LOCAL',
  syncOrder: [...airtable.SYNC_ORDER],
  tables: Object.entries(airtable.MAP).map(([collection, config]) => ({
    collection,
    table: config.table,
    fields: Object.entries(config.fields || {}).map(([local, remote]) => ({ local, remote, type: 'field' })),
    links: Object.entries(config.links || {}).map(([local, remote]) => ({ local, remote, type: 'link' })),
    naturalKeys: config.naturalKeys || []
  }))
});

console.log('Public procedure and Airtable catalogs exported.');
