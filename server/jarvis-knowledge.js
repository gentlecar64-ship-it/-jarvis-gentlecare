'use strict';

const knowledge = {
  company: {
    name: 'GentleCarE',
    legalForm: 'SARL',
    address: 'ZA Lantegia, 64990 Villefranque',
    activity: 'Cryonettoyage et protection adaptés aux véhicules, équipements et demandes spécialisées après étude',
    forbiddenTerms: ['garage auto'],
    excludedContacts: ['Piranha']
  },
  pricing: {
    automobileParticulierIntegralTtc: 1500,
    professionalHourlyRateExVat: 180,
    professionalTravelRateExVat: 85,
    activeFamilies: ['Voiture particulier', 'Voiture professionnel', 'Moto particulier', 'Moto professionnel', 'Utilitaire sur étude', 'Camion sur étude', 'Avion sur étude', 'Hélicoptère sur étude', 'Industriel sur étude', 'Autre sur étude'],
    motorcyclePriceRule: 'Ne jamais inventer un tarif moto. Utiliser uniquement la grille active configurée et faire valider le montant par la direction lorsque le prix n’est pas renseigné.',
    specializedPriceRule: 'Pour un utilitaire, un camion, un aéronef, une demande industrielle ou autre, aucun montant n’est inventé. Le prix, les moyens, les assurances, les exclusions et la marge sont validés par la direction.',
    specialOfferRule: 'Une remise exceptionnelle est une Offre spéciale décidée par David ou Bénédicte, avec bénéficiaire, tarif de référence, remise, prix final et contrôle de marge.'
  },
  operations: {
    dryIceKgPerVehicleReference: 20,
    initialTargetVehiclesPerMonth: 12,
    standardAutomobileDurationDays: 2,
    standardMotorcycleDurationDays: 1,
    workshopDays: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    workshopClosedDays: ['Samedi', 'Dimanche'],
    workshopRule: 'Le planning atelier ne doit jamais afficher ni proposer le samedi ou le dimanche.',
    workshopStartMode: 'La catégorie est choisie avant toute proposition. Chaque catégorie utilise sa procédure dédiée.'
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
    categories: ['voiture', 'moto', 'utilitaire', 'camion', 'avion', 'helicoptere', 'industriel', 'autre'],
    car: 'Utiliser la procédure voiture avec pont ou levage approprié, quatre points de levage et zones automobiles.',
    motorcycle: 'Utiliser la procédure moto avec plateforme, béquille ou lève-moto, deux roues, chaîne ou transmission, freins et exclusions propres aux motos.',
    utility: 'Vérifier le gabarit, la charge, la hauteur, les équipements professionnels et les moyens de levage avant chiffrage.',
    truck: 'Exiger une étude poids lourd avec site, gabarit, essieux, immobilisation, équipements et sécurité adaptés.',
    aircraft: 'Exiger les autorisations aéronautiques et la validation de maintenance compétente avant toute proposition opérationnelle.',
    industrial: 'Exiger l’analyse de risque, la consignation des énergies, les règles du site et une méthode spécifique.',
    orientationRule: 'Jarvis commence toujours par demander : « De quoi s’agit-il ? » puis propose voiture, moto, utilitaire, camion, avion, hélicoptère, devis industriel ou autre.'
  },
  governance: {
    partners: ['David', 'Bénédicte'],
    targetOwnership: '50/50',
    commercialRoles: ['David', 'Bénédicte'],
    directionOnlyDecisions: ['Prix personnalisé', 'Offre spéciale', 'Remise commerciale', 'Report d’une date client', 'Validation finale du devis', 'Acceptation d’une étude spécialisée']
  },
  workflowRules: [
    'La nature de la demande est le premier choix obligatoire du devis.',
    'Le dossier central peut concerner une voiture, une moto, un utilitaire, un camion, un aéronef, une machine industrielle ou un autre objet.',
    'Toute information acquise sur la page Devis doit être enregistrée dans une demande et dans les fiches correspondantes lorsque l’identification est suffisante, même si le devis n’est pas validé.',
    'Toujours demander confirmation avant de quitter la page Devis.',
    'Une demande de devis saisie par un employé est analysée par Jarvis puis soumise à David ou Bénédicte.',
    'Conserver devis, photos, rapports, procédures et communications dans le dossier.',
    'Créer un historique par objet ou véhicule.',
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
