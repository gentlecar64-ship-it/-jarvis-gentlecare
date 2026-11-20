'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '..', 'vehicle-finalization.js'), 'utf8');
const context = {
  module: { exports: {} },
  require: () => ({ detail: (store, id) => store.list('interventions').find(v => v.id === id) })
};
vm.runInNewContext(code, context, { filename: 'vehicle-finalization.js' });
const workflow = context.module.exports;
function fixture() {
  const records = { interventions: [{ id:'inter-1', number:'DEV-TEST', clientId:'client-1', vehicleId:'car-1', procedureStatus:'Validée par la direction', completionChecks:{}, status:'En atelier' }], planningBlocks:[] };
  return { records, store: {
    list: collection => records[collection] || [],
    update: (collection, id, patch) => {
      const idx = records[collection].findIndex(v=>v.id===id);
      records[collection][idx] = { ...records[collection][idx], ...patch };
      return records[collection][idx];
    },
    create: (collection, record) => {
      const item={ id:'record-'+(records[collection].length+1), ...record };
      records[collection].push(item);
      return item;
    }
  } };
}
test('lavage et mise en valeur doivent précéder le showroom', () => {
  const { store }=fixture();
  assert.throws(()=>workflow.showroom(store,'inter-1',{}),/EXTERIOR_WASH_REQUIRED/);
  assert.throws(()=>workflow.mark(store,'inter-1',{phase:'presentation'},{}),/EXTERIOR_WASH_REQUIRED_FIRST/);
  workflow.mark(store,'inter-1',{phase:'wash'},{name:'David'});
  assert.throws(()=>workflow.showroom(store,'inter-1',{}),/PRESENTATION_REQUIRED/);
  workflow.mark(store,'inter-1',{phase:'presentation'},{name:'David'});
  assert.equal(workflow.showroom(store,'inter-1',{name:'David'}).intervention.status,'En showroom — attente restitution');
  assert.equal(workflow.showroom(store,'inter-1',{}).alreadyDone,true);
});
test('restitution impossible à planifier avant showroom, puis enregistrée', () => {
  const { records,store }=fixture();
  assert.throws(()=>workflow.schedule(store,'inter-1',{type:'pickup',date:'2026-11-24',time:'16:30'},{}),/SHOWROOM_REQUIRED/);
  workflow.mark(store,'inter-1',{phase:'wash'},{}); workflow.mark(store,'inter-1',{phase:'presentation'},{});workflow.showroom(store,'inter-1',{});
  assert.equal(workflow.schedule(store,'inter-1',{type:'pickup',date:'2026-11-24',time:'16:30'},{}).block.clientId,'client-1');
  assert.equal(records.interventions[0].pickupTime,'16:30');
});
test('créneaux du week-end refusés', () => {
  const { store }=fixture();
  assert.throws(()=>workflow.schedule(store,'inter-1',{type:'wash',date:'2026-11-21',time:'10:00'},{}),/WORKSHOP_WEEKEND_CLOSED/);
});
