'use strict';

const { URL } = require('node:url');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'app6i45G4WG2nmQff';
const TOKEN = process.env.AIRTABLE_TOKEN || '';

const MAP = {
  clients: {
    table: 'Clients',
    fields: {
      name: 'Nom complet', email: 'Email', phone: 'Téléphone', notes: 'Notes client',
      status: 'Statut client', source: 'Origine du contact', clientType: 'Type de client'
    }
  },
  vehicles: {
    table: 'Véhicules',
    fields: {
      label: 'Véhicule', brand: 'Marque', model: 'Modèle', year: 'Année', mileage: 'Kilométrage',
      registration: 'Immatriculation', vin: 'VIN', history: 'Historique / état'
    },
    links: { clientId: 'Client' }
  },
  interventions: {
    table: 'Interventions',
    fields: {
      number: 'Intervention', scheduledDate: 'Date prévue', status: 'Statut', technician: 'Technicien',
      report: 'Compte rendu', dryIceKg: 'Glace réelle utilisée kg', dinitrolLiters: 'Dinitrol utilisé L'
    },
    links: { clientId: 'Client', vehicleId: 'Véhicule', quoteId: 'Dossier / devis' }
  },
  tasks: {
    table: 'Tâches Jarvis',
    fields: {
      title: 'Tâche', status: 'Statut', priority: 'Priorité', assignee: 'Responsable',
      dueDate: 'Échéance', instructions: 'Instructions', result: 'Résultat / suivi'
    }
  },
  stockItems: {
    table: 'Stocks et consommables',
    fields: {
      name: 'Article', category: 'Catégorie', reference: 'Référence', quantity: 'Quantité en stock',
      unit: 'Unité', alertThreshold: 'Seuil d’alerte', unitPriceHt: 'Prix unitaire HT', location: 'Emplacement', notes: 'Notes'
    }
  },
  quotes: {
    table: 'Dossiers et devis',
    fields: {
      number: 'Dossier', status: 'Statut', totalTtc: 'Montant TTC', requestDate: 'Date de demande',
      quoteDate: 'Date du devis', nextAction: 'Prochaine action', followUpDate: 'Échéance de suivi', notes: 'Notes'
    },
    links: { clientId: 'Client', vehicleId: 'Véhicule' }
  },
  documents: {
    table: 'Centre documentaire',
    fields: {
      title: 'Document', category: 'Catégorie', subcategory: 'Sous-catégorie', summary: 'Résumé Jarvis', addedDate: 'Date d’ajout'
    }
  }
};

function configured() { return Boolean(TOKEN); }

async function request(table, options = {}) {
  if (!configured()) throw Object.assign(new Error('AIRTABLE_NOT_CONFIGURED'), { status: 503 });
  const suffix = options.recordId ? `/${encodeURIComponent(options.recordId)}` : '';
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}${suffix}`);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || `AIRTABLE_${response.status}`), { status: response.status });
  return payload;
}

function findLinkedAirtableId(store, localId) {
  if (!localId) return null;
  for (const collection of ['clients', 'vehicles', 'quotes', 'interventions']) {
    const match = store.list(collection).find((item) => item.id === localId);
    if (match?.airtableId) return match.airtableId;
  }
  return null;
}

function buildFields(collection, record, store) {
  const config = MAP[collection];
  if (!config) throw Object.assign(new Error('SYNC_COLLECTION_NOT_SUPPORTED'), { status: 400 });
  const fields = {};
  for (const [localName, airtableName] of Object.entries(config.fields || {})) {
    const value = record[localName];
    if (value !== undefined && value !== null && value !== '') fields[airtableName] = value;
  }
  if (collection === 'vehicles' && !fields.Véhicule) {
    fields.Véhicule = [record.brand, record.model, record.registration].filter(Boolean).join(' ') || record.registration || 'Véhicule';
  }
  for (const [localName, airtableName] of Object.entries(config.links || {})) {
    const linkedId = findLinkedAirtableId(store, record[localName]);
    if (linkedId) fields[airtableName] = [linkedId];
  }
  return fields;
}

async function push(collection, record, store) {
  const config = MAP[collection];
  if (!config) throw Object.assign(new Error('SYNC_COLLECTION_NOT_SUPPORTED'), { status: 400 });
  const fields = buildFields(collection, record, store);
  const payload = record.airtableId
    ? await request(config.table, { method: 'PATCH', recordId: record.airtableId, body: { fields, typecast: true } })
    : await request(config.table, { method: 'POST', body: { fields, typecast: true } });
  return { collection, localId: record.id, airtableId: payload.id, syncedAt: new Date().toISOString(), fields: payload.fields || fields };
}

async function pushAll(store, collections = Object.keys(MAP)) {
  const results = [];
  for (const collection of collections) {
    if (!MAP[collection]) continue;
    for (const record of store.list(collection)) {
      try { results.push({ ok: true, ...(await push(collection, record, store)) }); }
      catch (error) { results.push({ ok: false, collection, localId: record.id, error: error.message }); }
    }
  }
  return { configured: configured(), total: results.length, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, results };
}

function status() {
  return { configured: configured(), baseId: BASE_ID, supportedCollections: Object.keys(MAP) };
}

module.exports = { MAP, configured, status, push, pushAll };
