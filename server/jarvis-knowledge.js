'use strict';

const knowledge = {
  company: {
    name: 'GentleCarE',
    legalForm: 'SARL',
    address: 'ZA Lantegia, 64990 Villefranque',
    activity: 'Cryonettoyage automobile et moto, avec protection anticorrosion Dinitrol adaptée aux supports et aux exclusions de sécurité',
    forbiddenTerms: ['garage auto'],
    excludedContacts: ['Piranha']
  },
  pricing: {
    automobileParticulierIntegralTtc: 1500,
    professionalHourlyRateExVat: 180,
    professionalTravelRateExVat: 85,
    activeFamilies: ['Automobile particulier', 'Automobile professionnel', 'Moto particulier', 'Moto professionnel'],
    motorcyclePriceRule: 'Ne jamais inventer un tarif moto. Utiliser uniquement la grille active configurée et faire valider le montant par la direction lorsque le prix n’est pas renseigné.',
    specialOfferRule: 'Aucun tarif Club ni Pass Fondateur. Une remise exceptionnelle est une Offre spéciale décidée par David ou Bénédicte, avec bénéficiaire, tarif de référence, remise, prix final et contrôle de marge.'
  },
  operations: {
    dryIceKgPerVehicleReference: 20,
    initialTargetVehiclesPerMonth: 12,
    standardAutomobileDurationDays: 2,
    standardMotorcycleDurationDays: 1,
    workshopDays: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    workshopClosedDays: ['Samedi', 'Dimanche'],
    workshopRule: 'Le planning atelier ne doit jamais afficher ni proposer le samedi ou le dimanche.',
    workshopStartMode: 'Automobile et moto selon les procédures dédiées; activité industrielle après embauche et contrats adaptés.'
  },
  dryIce: {
    standardPricePerKg: 3.8,
    volumePricePerKg: 2.5,
    deliveryAdr: 75,
    containerCapacityKg: 350
  },
  equipment: {
    cryogenicMachine: 'IBL2500',
    workingPressureBar: 10,
    maximumPressureBar: 15,
    electricalConstraintKw: 24,
    desiredElectricalPowerKw: 36
  },
  procedures: {
    automobile: 'Utiliser la procédure automobile avec pont ou levage approprié, quatre points de levage et zones automobiles.',
    motorcycle: 'Utiliser la procédure moto avec plateforme, béquille ou lève-moto, deux roues, chaîne ou transmission, freins et exclusions propres aux motos.',
    orientationRule: 'Le type automobile ou moto doit être choisi dès la demande de devis afin que Jarvis pose uniquement les questions pertinentes.'
  },
  governance: {
    partners: ['David', 'Bénédicte'],
    targetOwnership: '50/50',
    commercialRoles: ['David', 'Bénédicte'],
    directionOnlyDecisions: ['Prix personnalisé', 'Offre spéciale', 'Remise commerciale', 'Report d’une date client', 'Validation finale du devis']
  },
  workflowRules: [
    'Le véhicule est l’entité centrale du dossier.',
    'Toute information acquise sur la page Devis doit être enregistrée dans une demande et dans les fiches client et véhicule lorsque l’identification est suffisante, même si le devis n’est pas validé.',
    'Toujours demander confirmation avant de quitter la page Devis.',
    'Une demande de devis saisie par un employé est analysée par Jarvis puis soumise à David ou Bénédicte.',
    'Conserver devis, photos, rapports, procédures et communications dans le dossier client.',
    'Créer un historique par véhicule.',
    'Ne jamais contacter Piranha.',
    'Ne pas employer l’expression garage auto dans la communication GentleCarE.'
  ]
};

function search(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  function walk(value, path = []) {
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, [...path, index])); return; }
    if (value && typeof value === 'object') { Object.entries(value).forEach(([key, item]) => walk(item, [...path, key])); return; }
    const text = String(value);
    const pathText = path.join('.');
    if (text.toLowerCase().includes(q) || pathText.toLowerCase().includes(q)) results.push({ path: pathText, value });
  }
  walk(knowledge);
  return results.slice(0, 20);
}

module.exports = { knowledge, search };
