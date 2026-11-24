'use strict';

const { knowledge, search: searchKnowledge } = require('./jarvis-knowledge');

const workingMemory = new Map();
const MEMORY_TTL_MS = 12 * 60 * 60 * 1000;

function todayKey() { return new Date().toISOString().slice(0, 10); }
function normalize(value) { return String(value || '').trim().toLowerCase(); }
function firstName(user = {}) { return String(user.name || 'David').trim().split(/\s+/)[0]; }
function activeStatus(status) { return !['Terminée', 'Livrée', 'Annulée'].includes(String(status || '')); }
function openQuote(status) { return ['Brouillon', 'Envoyé', 'À relancer'].includes(String(status || '')); }
function memoryKey(user = {}) { return user.id || user.username || user.name || 'default'; }

function getMemory(user = {}) {
  const key = memoryKey(user);
  const current = workingMemory.get(key);
  if (!current || Date.now() - current.updatedAt > MEMORY_TTL_MS) {
    const fresh = { clientId: '', vehicleId: '', quoteId: '', interventionId: '', lastIntent: '', updatedAt: Date.now() };
    workingMemory.set(key, fresh);
    return fresh;
  }
  return current;
}

function remember(user, patch = {}) {
  const key = memoryKey(user);
  const next = { ...getMemory(user), ...patch, updatedAt: Date.now() };
  workingMemory.set(key, next);
  return next;
}

function safeList(store, collection) {
  try { return store.list(collection) || []; }
  catch { return []; }
}

function findByText(items, text, fields) {
  const q = normalize(text);
  if (!q) return null;
  return items.find((item) => fields.some((field) => normalize(item[field]).includes(q) || q.includes(normalize(item[field])) && normalize(item[field]).length > 2));
}

function linkedContext(store, user) {
  const memory = getMemory(user);
  const client = safeList(store, 'clients').find((item) => item.id === memory.clientId) || null;
  const vehicle = safeList(store, 'vehicles').find((item) => item.id === memory.vehicleId) || null;
  const quote = safeList(store, 'quotes').find((item) => item.id === memory.quoteId) || null;
  const intervention = safeList(store, 'interventions').find((item) => item.id === memory.interventionId) || null;
  return { memory, client, vehicle, quote, intervention };
}

function brief(store, user = {}) {
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const interventions = safeList(store, 'interventions');
  const observations = safeList(store, 'observations');
  const tasks = safeList(store, 'tasks');
  const stocks = safeList(store, 'stockItems');
  const quotes = safeList(store, 'quotes');
  const today = todayKey();
  const todayInterventions = interventions.filter((item) => String(item.scheduledDate || '').slice(0, 10) === today);
  const openInterventions = interventions.filter((item) => activeStatus(item.status));
  const urgentObservations = observations.filter((item) => item.severity === 'Urgent' && item.decision === 'En attente');
  const pendingTasks = tasks.filter((item) => item.status !== 'Terminée');
  const urgentTasks = pendingTasks.filter((item) => /urgent/i.test(String(item.priority || '')) || (item.dueDate && String(item.dueDate).slice(0, 10) <= today));
  const lowStock = stocks.filter((item) => Number(item.alertThreshold || 0) > 0 && Number(item.quantity || 0) <= Number(item.alertThreshold || 0));
  const pendingQuotes = quotes.filter((item) => openQuote(item.status));
  const staleQuotes = pendingQuotes.filter((item) => {
    const d = new Date(item.followUpDate || item.quoteDate || item.updatedAt || item.createdAt || 0);
    return Number.isFinite(d.getTime()) && Date.now() - d.getTime() > 5 * 86400000;
  });
  const alerts = [
    ...urgentTasks.map((item) => ({ level: 'urgent', type: 'task', label: item.title || 'Tâche urgente', id: item.id })),
    ...lowStock.map((item) => ({ level: 'warning', type: 'stock', label: `Stock faible : ${item.name || 'article'}`, id: item.id })),
    ...staleQuotes.map((item) => ({ level: 'warning', type: 'quote', label: `Devis à relancer : ${item.number || 'sans numéro'}`, id: item.id })),
    ...urgentObservations.map((item) => ({ level: 'urgent', type: 'observation', label: item.title || item.label || 'Observation urgente', id: item.id }))
  ].slice(0, 12);
  return {
    greeting: `Bonjour ${firstName(user)}. ${todayInterventions.length} intervention(s) aujourd’hui, ${urgentTasks.length} priorité(s), ${pendingQuotes.length} devis en attente et ${lowStock.length} alerte(s) de stock.`,
    todayInterventions, openInterventions, urgentObservations, pendingTasks, urgentTasks, pendingQuotes, staleQuotes, lowStock, alerts,
    context: linkedContext(store, user),
    user: { id: user.id || '', name: user.name || firstName(user), role: user.role || 'admin' },
    totals: { clients: clients.length, vehicles: vehicles.length, interventions: interventions.length, tasks: tasks.length, quotes: quotes.length, stockItems: stocks.length }
  };
}

function pricingAnswer(normalized) {
  if (!/tarif|prix|combien|coûte|coute/.test(normalized)) return null;
  const p = knowledge.pricing;
  if (/fondateur|pass/.test(normalized)) return `Le Pack Intégral Pass Fondateur est à ${p.integralFounderTtc} € TTC, soit ${p.founderDiscountPercent} % de remise.`;
  if (/club/.test(normalized)) return `Le tarif Club du Pack Intégral est à ${p.integralClubTtc} € TTC.`;
  if (/déplacement|deplacement/.test(normalized)) return `Le déplacement est facturé ${p.travelRateExVat} € HT par heure.`;
  if (/heure|horaire|main.?d.?œuvre|main.?d.?oeuvre/.test(normalized)) return `Le tarif atelier est de ${p.hourlyRateExVat} € HT par heure.`;
  if (/intégral|integral|cryo.*dinitrol|dinitrol.*cryo/.test(normalized)) return `Le Pack Intégral Cryo + Dinitrol est à ${p.integralPublicTtc} € TTC au tarif public, ${p.integralClubTtc} € TTC au tarif Club et ${p.integralFounderTtc} € TTC avec le Pass Fondateur.`;
  return null;
}

function extractAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function execute(store, input = {}) {
  const text = String(input.text || '').trim();
  const normalized = normalize(text);
  const user = input.user || {};
  if (!text) return { type: 'message', answer: 'Donnez-moi une instruction.', context: linkedContext(store, user) };

  if (/bonjour|point du jour|fais.*point|résumé.*jour|resume.*jour|priorités|priorites/.test(normalized)) {
    const data = brief(store, user);
    remember(user, { lastIntent: 'dailyBrief' });
    return { type: 'brief', answer: data.greeting, data, context: data.context };
  }

  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  const quotes = safeList(store, 'quotes');
  const interventions = safeList(store, 'interventions');

  const createClientName = extractAfter(text, [/(?:crée|cree|ajoute|enregistre)\s+(?:une\s+)?(?:fiche\s+)?client(?:e)?\s+(?:pour\s+)?(.+)/i]);
  if (createClientName) {
    const existing = findByText(clients, createClientName, ['name', 'email', 'phone']);
    if (existing) {
      remember(user, { clientId: existing.id, lastIntent: 'selectClient' });
      return { type: 'client', answer: `${existing.name || createClientName} existe déjà. Je l’ai sélectionné comme client courant.`, data: { client: existing }, context: linkedContext(store, user) };
    }
    const client = store.create('clients', { name: createClientName, status: 'Prospect', createdBy: user.id || '', createdByName: user.name || '' });
    remember(user, { clientId: client.id, vehicleId: '', quoteId: '', interventionId: '', lastIntent: 'createClient' });
    return { type: 'client-created', answer: `Fiche client créée pour ${client.name}.`, data: { client }, context: linkedContext(store, user) };
  }

  const requestedClient = extractAfter(text, [/(?:ouvre|cherche|recherche|retrouve|sélectionne|selectionne)\s+(?:la\s+fiche\s+de\s+|le\s+client\s+|client\s+)?(.+)/i]);
  if (requestedClient && !/véhicule|vehicule|devis|tâche|tache/.test(normalized)) {
    const client = findByText(clients, requestedClient, ['name', 'email', 'phone']);
    if (client) {
      const clientVehicles = vehicles.filter((item) => item.clientId === client.id);
      const clientQuotes = quotes.filter((item) => item.clientId === client.id);
      remember(user, { clientId: client.id, vehicleId: '', quoteId: '', interventionId: '', lastIntent: 'searchClient' });
      return { type: 'client', answer: `${client.name} trouvé : ${clientVehicles.length} véhicule(s) et ${clientQuotes.length} devis/dossier(s).`, data: { client, vehicles: clientVehicles, quotes: clientQuotes }, context: linkedContext(store, user) };
    }
  }

  const vehicle = findByText(vehicles, text, ['label', 'brand', 'model', 'registration', 'vin']);
  if (vehicle) {
    const vehicleInterventions = interventions.filter((item) => item.vehicleId === vehicle.id);
    remember(user, { vehicleId: vehicle.id, clientId: vehicle.clientId || getMemory(user).clientId, lastIntent: 'searchVehicle' });
    return { type: 'vehicle', answer: `${vehicle.label || [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Véhicule'} ${vehicle.registration || ''} : ${vehicleInterventions.length} intervention(s).`, data: { vehicle, interventions: vehicleInterventions }, context: linkedContext(store, user) };
  }

  const addTask = text.match(/(?:ajoute|crée|cree|note|programme)\s+(?:une\s+)?tâche\s*[:\-]?\s*(.+)/i);
  if (addTask) {
    const context = linkedContext(store, user);
    const task = store.create('tasks', {
      title: addTask[1].trim(), status: 'À faire', priority: /urgent/i.test(text) ? 'Urgente' : 'Normale',
      instructions: [context.client && `Client : ${context.client.name}`, context.vehicle && `Véhicule : ${context.vehicle.label || context.vehicle.model}`, context.quote && `Dossier : ${context.quote.number}`].filter(Boolean).join('\n'),
      createdBy: user.id || '', createdByName: user.name || ''
    });
    remember(user, { lastIntent: 'createTask' });
    return { type: 'task-created', answer: `Tâche ajoutée : ${task.title}.`, data: { task }, context: linkedContext(store, user) };
  }

  if (/contexte|dossier courant|client courant|véhicule courant|vehicule courant/.test(normalized)) {
    const context = linkedContext(store, user);
    const parts = [context.client && `client ${context.client.name}`, context.vehicle && `véhicule ${context.vehicle.label || context.vehicle.model}`, context.quote && `dossier ${context.quote.number}`, context.intervention && `intervention ${context.intervention.number}`].filter(Boolean);
    return { type: 'context', answer: parts.length ? `Contexte actuel : ${parts.join(', ')}.` : 'Aucun client, véhicule ou dossier n’est sélectionné.', data: context, context };
  }

  if (/tâches?|taches?|à faire|a faire/.test(normalized)) {
    const records = safeList(store, 'tasks').filter((item) => item.status !== 'Terminée');
    return { type: 'tasks', answer: `${records.length} tâche(s) restent à faire.`, data: { records }, context: linkedContext(store, user) };
  }

  if (/stock|fournitures?|glace disponible|dinitrol disponible/.test(normalized)) {
    const records = safeList(store, 'stockItems');
    const low = records.filter((item) => Number(item.alertThreshold || 0) > 0 && Number(item.quantity || 0) <= Number(item.alertThreshold || 0));
    return { type: 'stock', answer: `${records.length} article(s) suivis, dont ${low.length} en alerte.`, data: { records, low }, context: linkedContext(store, user) };
  }

  if (/devis/.test(normalized) && /(attente|relancer|combien|nombre)/.test(normalized)) {
    const records = quotes.filter((item) => openQuote(item.status));
    return { type: 'quotes', answer: `${records.length} devis sont en attente ou à relancer.`, data: { records }, context: linkedContext(store, user) };
  }

  const price = pricingAnswer(normalized);
  if (price) return { type: 'knowledge', answer: price, data: { source: 'GentleCarE' }, context: linkedContext(store, user) };
  if (/adresse|siège|siege/.test(normalized)) return { type: 'knowledge', answer: `L’adresse GentleCarE est ${knowledge.company.address}.`, data: knowledge.company, context: linkedContext(store, user) };
  if (/glace|carbonique|pellet/.test(normalized)) { const d = knowledge.dryIce; return { type: 'knowledge', answer: `Base de calcul : ${knowledge.operations.dryIceKgPerVehicle} kg par véhicule. Glace à ${d.standardPricePerKg} €/kg, ou ${d.volumePricePerKg} €/kg en volume, plus ${d.deliveryAdr} € de livraison ADR.`, data: d, context: linkedContext(store, user) }; }
  if (/pression|compresseur|ibl2500|machine cryo/.test(normalized)) { const e = knowledge.equipment; return { type: 'knowledge', answer: `Machine ${e.cryogenicMachine} : travail prévu à ${e.workingPressureBar} bars, maximum ${e.maximumPressureBar} bars. Contrainte électrique actuelle : ${e.electricalConstraintKw} kW, objectif ${e.desiredElectricalPowerKw} kW.`, data: e, context: linkedContext(store, user) }; }
  if (/règle|regle|procédure|procedure|consigne/.test(normalized)) return { type: 'knowledge', answer: knowledge.workflowRules.join(' '), data: { rules: knowledge.workflowRules }, context: linkedContext(store, user) };
  if (/clients?/.test(normalized) && /(combien|nombre)/.test(normalized)) return { type: 'metric', answer: `${clients.length} client(s) enregistré(s).`, data: { count: clients.length }, context: linkedContext(store, user) };
  if (/véhicules?|vehicules?/.test(normalized) && /(combien|nombre)/.test(normalized)) return { type: 'metric', answer: `${vehicles.length} véhicule(s) enregistré(s).`, data: { count: vehicles.length }, context: linkedContext(store, user) };
  if (/interventions?|atelier/.test(normalized)) { const open = interventions.filter((item) => activeStatus(item.status)); return { type: 'interventions', answer: `${open.length} intervention(s) active(s).`, data: { records: open }, context: linkedContext(store, user) }; }

  const matches = searchKnowledge(text);
  if (matches.length) return { type: 'knowledge-search', answer: matches.map((item) => `${item.path} : ${item.value}`).join('\n'), data: { matches }, context: linkedContext(store, user) };
  return { type: 'message', answer: 'Je n’ai pas encore cette information. Donnez-moi le nom du client, du véhicule, du devis ou l’action à effectuer.', context: linkedContext(store, user) };
}

module.exports = { brief, execute, knowledge, getMemory };
