'use strict';

function normalize(value) { return String(value || '').trim(); }
function lower(value) { return normalize(value).toLowerCase(); }
function digits(value) { return normalize(value).replace(/\D/g, ''); }
function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }

function extractReference(text) {
  const value = normalize(text);
  const email = (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0].toLowerCase();
  const phone = (value.match(/(?:(?:\+33|0033)[ .-]?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}/) || [''])[0];
  const registration = ((value.toUpperCase().match(/\b[A-Z]{2}[ -]?\d{3}[ -]?[A-Z]{2}\b/) || [''])[0]).replace(/\s/g, '-');
  const patterns = [
    /(?:ouvre|affiche|cherche|recherche)\s+(?:moi\s+)?(?:la\s+|le\s+)?(?:fiche|dossier)(?:\s+client)?\s+(?:de|du|pour)\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,80})/i,
    /(?:fiche|dossier)(?:\s+client)?\s+(?:de|du|pour)\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,80})/i,
    /(?:appel\s+de|client\s+|pour\s+monsieur\s+|pour\s+madame\s+)([A-Za-zÀ-ÖØ-öø-ÿ' -]{3,80})/i
  ];
  let name = '';
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) continue;
    name = match[1].replace(/\b(?:avec|mail|email|e-mail|téléphone|telephone|portable|voiture|véhicule|vehicule|immatriculation)\b.*$/i, '').trim();
    if (name) break;
  }
  return { email, phone, registration, name };
}

function clientMissing(client) {
  const missing = [];
  if (!client.name) missing.push({ field: 'name', label: 'nom et prénom', question: 'Pouvez-vous me confirmer votre nom et votre prénom ?' });
  if (!client.email) missing.push({ field: 'email', label: 'e-mail', question: 'Quelle adresse e-mail souhaitez-vous utiliser pour recevoir le devis et les documents ?' });
  if (!(client.mobile || client.phone)) missing.push({ field: 'mobile', label: 'portable', question: 'Quel est votre numéro de portable ?' });
  if (!client.preferredChannel) missing.push({ field: 'preferredChannel', label: 'canal préféré', question: 'Préférez-vous être contacté par téléphone, SMS ou e-mail ?' });
  if (client.smsAllowed === undefined && client.emailAllowed === undefined) missing.push({ field: 'contactConsent', label: 'autorisation de contact', question: 'M’autorisez-vous à vous contacter par SMS ou e-mail au sujet de votre dossier ?' });
  return missing;
}

function vehicleMissing(vehicle) {
  const missing = [];
  if (!vehicle.registration) missing.push({ field: 'registration', label: 'immatriculation', question: 'Pouvez-vous me donner l’immatriculation du véhicule ?' });
  if (!vehicle.brand) missing.push({ field: 'brand', label: 'marque', question: 'Quelle est la marque du véhicule ?' });
  if (!vehicle.model) missing.push({ field: 'model', label: 'modèle', question: 'Quel est le modèle exact du véhicule ?' });
  if (!vehicle.year) missing.push({ field: 'year', label: 'année', question: 'De quelle année est le véhicule ?' });
  if (!vehicle.mileage) missing.push({ field: 'mileage', label: 'kilométrage', question: 'Quel est son kilométrage actuel ?' });
  if (!vehicle.color) missing.push({ field: 'color', label: 'couleur', question: 'Quelle est sa couleur ?' });
  if (!vehicle.engine) missing.push({ field: 'engine', label: 'motorisation', question: 'Quelle est sa motorisation ?' });
  if (!vehicle.gearbox) missing.push({ field: 'gearbox', label: 'boîte', question: 'La boîte est-elle manuelle ou automatique ?' });
  if (!vehicle.conditionNotes) missing.push({ field: 'conditionNotes', label: 'état avant travaux', question: 'Comment décririez-vous l’état actuel du véhicule et les zones à traiter ?' });
  if (!vehicle.photoUrl) missing.push({ field: 'photoUrl', label: 'photos', question: 'Pouvez-vous nous transmettre une ou plusieurs photos du véhicule ?' });
  if (!vehicle.clientEstimatedValue) missing.push({ field: 'clientEstimatedValue', label: 'estimation client', question: 'Selon vous, quelle est la valeur actuelle de votre véhicule dans son état ?' });
  return missing;
}

function scoreClient(client, reference) {
  let score = 0;
  if (reference.email && lower(client.email) === reference.email) score += 100;
  if (reference.phone && digits(client.mobile || client.phone) === digits(reference.phone)) score += 100;
  if (reference.name && lower(client.name).includes(lower(reference.name))) score += 60;
  return score;
}

function lookup(store, query) {
  const reference = typeof query === 'string' ? extractReference(query) : query || {};
  const clients = safeList(store, 'clients');
  const vehicles = safeList(store, 'vehicles');
  let client = null;
  let selectedVehicle = null;

  if (reference.registration) {
    selectedVehicle = vehicles.find((vehicle) => normalize(vehicle.registration).toUpperCase() === reference.registration.toUpperCase()) || null;
    if (selectedVehicle) client = clients.find((item) => item.id === selectedVehicle.clientId) || null;
  }

  if (!client) {
    const ranked = clients.map((item) => ({ item, score: scoreClient(item, reference) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    client = ranked[0]?.item || null;
  }

  if (!client) return { found: false, reference, clients: [], vehicles: [], answer: 'Je ne trouve pas encore ce client. Donnez-moi son nom, son e-mail, son portable ou l’immatriculation du véhicule pour créer ou retrouver le dossier.' };

  const clientVehicles = vehicles.filter((item) => item.clientId === client.id);
  if (!selectedVehicle && clientVehicles.length === 1) selectedVehicle = clientVehicles[0];
  const clientGaps = clientMissing(client);
  const vehicleGaps = selectedVehicle ? vehicleMissing(selectedVehicle) : [];
  const questions = [...clientGaps, ...vehicleGaps].map((item) => item.question);
  const vehicleList = clientVehicles.map((item) => `${item.brand || ''} ${item.model || ''}${item.registration ? ` (${item.registration})` : ''}`.trim()).filter(Boolean);
  const answer = [
    `Dossier client trouvé : ${client.name || 'nom à compléter'}.`,
    clientVehicles.length ? `${clientVehicles.length} véhicule(s) rattaché(s) : ${vehicleList.join(', ')}.` : 'Aucun véhicule enregistré : je peux en ajouter un sans limite de quantité.',
    selectedVehicle ? `Véhicule sélectionné : ${selectedVehicle.brand || ''} ${selectedVehicle.model || ''} ${selectedVehicle.registration || ''}.`.replace(/\s+/g, ' ').trim() : 'Choisissez un véhicule existant ou ajoutez-en un nouveau.',
    questions.length ? `Questions à poser maintenant : ${questions.join(' ')}` : 'La fiche est suffisamment complète pour démarrer le devis.'
  ].join('\n');

  return {
    found: true,
    reference,
    client,
    vehicles: clientVehicles,
    selectedVehicle,
    missing: { client: clientGaps, vehicle: vehicleGaps },
    questions,
    answer,
    actions: [{ id: 'use-vehicle', label: 'Utiliser ce véhicule' }, { id: 'add-vehicle', label: 'Ajouter un véhicule' }]
  };
}

function isLookupCommand(text) {
  return /(?:ouvre|affiche|cherche|recherche).*(?:fiche|dossier|client)|(?:fiche|dossier).*(?:client|de)|qui est le client|appel de/i.test(String(text || ''));
}

module.exports = { extractReference, lookup, clientMissing, vehicleMissing, isLookupCommand };
