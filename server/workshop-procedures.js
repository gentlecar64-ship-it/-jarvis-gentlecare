'use strict';

const CATEGORIES = Object.freeze([
  { key: 'voiture', label: 'Voiture', aliases: ['voiture', 'automobile', 'auto', 'véhicule léger', 'vehicule leger'] },
  { key: 'moto', label: 'Moto / deux-roues', aliases: ['moto', 'motocycle', 'scooter', 'deux roues', 'deux-roues'] },
  { key: 'utilitaire', label: 'Utilitaire', aliases: ['utilitaire', 'fourgon', 'fourgonette', 'fourgonnette', 'van professionnel'] },
  { key: 'camion', label: 'Camion / poids lourd', aliases: ['camion', 'poids lourd', 'poids-lourd', 'tracteur routier', 'semi-remorque'] },
  { key: 'avion', label: 'Avion', aliases: ['avion', 'aéronef', 'aeronef'] },
  { key: 'helicoptere', label: 'Hélicoptère', aliases: ['hélicoptère', 'helicoptere', 'hélico', 'helico'] },
  { key: 'industriel', label: 'Devis industriel', aliases: ['industriel', 'industrie', 'machine industrielle', 'devis industriel', 'équipement industriel', 'equipement industriel'] },
  { key: 'autre', label: 'Autre', aliases: ['autre', 'divers', 'cas particulier'] }
]);

const PROCEDURES = Object.freeze({
  voiture: {
    key: 'voiture-standard-v1', requestCategory: 'voiture', vehicleType: 'voiture', label: 'Procédure atelier voiture — Cryo + protection', version: '1.0', defaultDurationDays: 2,
    checklist: [
      'Identifier la voiture, contrôler l’immatriculation, le VIN communiqué et le kilométrage.',
      'Effectuer les photographies horodatées de réception et relever les réserves visibles.',
      'Valider avec le client les zones traitées, exclusions et démontages autorisés.',
      'Sécuriser la voiture sur le pont ou le dispositif de levage adapté et contrôler les quatre points de levage.',
      'Déposer uniquement les protections et roues prévues au devis ; identifier chaque élément déposé.',
      'Protéger l’électronique sensible, les prises d’air, les freins, les échappements chauds et les surfaces incompatibles.',
      'Réaliser un essai cryogénique sur une zone discrète avant traitement général.',
      'Traiter méthodiquement le dessous, le moteur si prévu, les quatre passages de roue et les zones détaillées au devis.',
      'Documenter la pression, les buses, le temps de travail, la consommation de glace et les anomalies révélées.',
      'Préparer les supports puis masquer les zones exclues avant application Dinitrol.',
      'Tracer les produits, numéros de lots, quantités, corps creux et temps de séchage.',
      'Remonter, serrer et contrôler les éléments déposés selon les prescriptions applicables.',
      'Réaliser les photographies comparables avant/après, le contrôle final et le rapport de référence de la voiture.'
    ]
  },
  moto: {
    key: 'moto-standard-v1', requestCategory: 'moto', vehicleType: 'moto', label: 'Procédure atelier moto — Cryo + protection adaptée', version: '1.0', defaultDurationDays: 1,
    checklist: [
      'Identifier la moto, contrôler l’immatriculation, le VIN communiqué et le kilométrage.',
      'Effectuer les photographies horodatées de réception et relever les réserves visibles.',
      'Valider avec le client les zones traitées, exclusions, accessoires et démontages autorisés.',
      'Stabiliser la moto sur une plateforme, béquille ou lève-moto adapté ; ne pas utiliser la procédure de levage d’une voiture.',
      'Déposer uniquement les carénages, sabot, selle, protections ou deux roues prévus au devis ; identifier chaque élément déposé.',
      'Protéger la chaîne ou la transmission, les disques et étriers, les pneus, les roulements, les prises d’air, l’électronique et les commandes.',
      'Réaliser un essai cryogénique sur une zone discrète, notamment sur peinture, aluminium, magnésium, carbone, plastiques et joints.',
      'Traiter méthodiquement moteur, cadre, bras oscillant, dessous, jantes et zones détaillées au devis.',
      'Documenter la pression, les buses, le temps de travail, la consommation de glace et les anomalies révélées.',
      'Appliquer uniquement les protections compatibles avec la moto ; exclure freins, pneus, chaîne, commandes et surfaces chauffantes.',
      'Tracer les produits, numéros de lots, quantités, zones protégées et temps de séchage.',
      'Remonter, serrer et contrôler les éléments déposés selon les prescriptions du constructeur.',
      'Réaliser les photographies comparables avant/après, le contrôle final et le rapport de référence de la moto.'
    ]
  },
  utilitaire: {
    key: 'utilitaire-standard-v1', requestCategory: 'utilitaire', vehicleType: 'utilitaire', label: 'Procédure atelier utilitaire — étude du gabarit et de la charge', version: '1.0', defaultDurationDays: 2,
    checklist: [
      'Identifier l’utilitaire, son gabarit, son poids total autorisé, son empattement, son immatriculation, son VIN et son kilométrage.',
      'Vérifier avant acceptation que l’accès, la hauteur, la largeur, la longueur et le dispositif de levage sont compatibles.',
      'Photographier la réception, la zone de chargement, les bas de caisse, les passages de roue et les équipements ajoutés.',
      'Faire retirer ou sécuriser le chargement, les étagères, réservoirs, groupes froids et accessoires susceptibles de gêner ou de créer un risque.',
      'Définir les points de levage ou la méthode de travail au sol selon le constructeur et le matériel réellement disponible.',
      'Protéger les circuits électriques, pneumatiques, carburant, AdBlue, freinage, refroidissement et les équipements professionnels.',
      'Réaliser un essai de compatibilité sur une zone discrète.',
      'Traiter uniquement les zones prévues au devis et documenter toute impossibilité d’accès.',
      'Tracer les consommations, produits, temps, réserves et anomalies.',
      'Réaliser le contrôle final et le rapport de référence de l’utilitaire.'
    ]
  },
  camion: {
    key: 'camion-standard-v1', requestCategory: 'camion', vehicleType: 'camion', label: 'Procédure camion / poids lourd — étude technique préalable obligatoire', version: '1.0', defaultDurationDays: 3,
    checklist: [
      'Identifier le porteur, tracteur, remorque ou ensemble, avec immatriculations, VIN, kilométrage, PTAC/PTRA et configuration des essieux.',
      'Valider le lieu d’intervention, le gabarit, la capacité du sol, l’accès, le balisage et les moyens de levage ou de fosse adaptés au poids lourd.',
      'Consigner la configuration des équipements : sellette, hayon, hydraulique, suspension pneumatique, réservoirs, freinage et accessoires de carrosserie.',
      'Obtenir l’autorisation de l’exploitant et les consignes de sécurité propres au véhicule avant toute intervention.',
      'Mettre le véhicule en sécurité, immobiliser et isoler les énergies conformément aux procédures du site et du constructeur.',
      'Protéger les organes de freinage, capteurs, faisceaux, flexibles, pneumatiques, échappement et équipements sensibles.',
      'Réaliser un essai de compatibilité puis traiter les zones définies au devis.',
      'Ne jamais appliquer un produit anticorrosion sur un organe de freinage, une surface de friction, un capteur ou une zone interdite.',
      'Tracer les paramètres, quantités, lots, temps d’intervention et anomalies.',
      'Réaliser le contrôle final, les photographies et le rapport de référence poids lourd.'
    ]
  },
  avion: {
    key: 'avion-etude-v1', requestCategory: 'avion', vehicleType: 'avion', label: 'Procédure avion — devis sur étude et autorisations aéronautiques', version: '1.0', defaultDurationDays: 1,
    checklist: [
      'Identifier l’aéronef, son immatriculation, son type, son exploitant, sa documentation applicable et la zone exacte demandée.',
      'Classer la demande en étude spécialisée : aucun traitement n’est autorisé sur la seule base d’une procédure automobile.',
      'Obtenir l’accord écrit de l’exploitant, du responsable de maintenance et, lorsque nécessaire, de l’organisme agréé compétent.',
      'Contrôler les exigences de sûreté, accès piste ou hangar, prévention FOD, mise à la masse, ventilation et protection incendie.',
      'Identifier les matériaux, peintures, composites, joints, capteurs, prises statiques, commandes, moteurs et zones interdites.',
      'Définir une méthode, un essai de compatibilité et un plan de protection validés avant chiffrage définitif.',
      'Ne jamais intervenir sur un organe de vol, de navigation, de propulsion ou de sécurité sans procédure approuvée.',
      'Documenter les autorisations, responsabilités, exclusions, moyens, temps et consommables.',
      'Faire valider le devis et la procédure par la direction avant toute promesse de date.',
      'Établir un rapport de traçabilité spécifique si l’étude est acceptée.'
    ]
  },
  helicoptere: {
    key: 'helicoptere-etude-v1', requestCategory: 'helicoptere', vehicleType: 'helicoptere', label: 'Procédure hélicoptère — devis sur étude et autorisations aéronautiques', version: '1.0', defaultDurationDays: 1,
    checklist: [
      'Identifier l’hélicoptère, son immatriculation, son type, son exploitant, sa documentation applicable et la zone exacte demandée.',
      'Classer la demande en étude spécialisée : ne jamais appliquer la procédure voiture, moto ou camion.',
      'Obtenir l’accord écrit de l’exploitant, du responsable de maintenance et, lorsque nécessaire, de l’organisme agréé compétent.',
      'Sécuriser la zone, les rotors, transmissions, prises d’air, capteurs, circuits hydrauliques et équipements de secours.',
      'Contrôler les exigences de sûreté, prévention FOD, mise à la masse, ventilation et protection incendie.',
      'Identifier les matériaux et revêtements puis définir un essai de compatibilité validé.',
      'Ne jamais intervenir sur les rotors, commandes de vol, transmissions, moteurs ou organes de sécurité sans procédure approuvée.',
      'Documenter autorisations, responsabilités, exclusions, moyens, temps et consommables.',
      'Faire valider le devis et la procédure par la direction avant toute promesse de date.',
      'Établir un rapport de traçabilité spécifique si l’étude est acceptée.'
    ]
  },
  industriel: {
    key: 'industriel-etude-v1', requestCategory: 'industriel', vehicleType: 'industriel', label: 'Procédure devis industriel — analyse de risque et consignation', version: '1.0', defaultDurationDays: 1,
    checklist: [
      'Identifier l’entreprise, le site, la machine, sa fonction, ses matériaux, ses dimensions et les zones demandées.',
      'Recueillir les plans, fiches de données de sécurité, exigences qualité, contraintes de production et règles du site.',
      'Réaliser une analyse de risque préalable et définir les responsabilités de consignation.',
      'Exiger l’arrêt, la consignation et la vérification d’absence d’énergie par la personne habilitée du site avant intervention.',
      'Identifier les surfaces sensibles, capteurs, roulements, lubrifiants, circuits électriques, pneumatiques, hydrauliques et zones alimentaires éventuelles.',
      'Définir la méthode, la ventilation, le confinement, la récupération des déchets et un essai de compatibilité.',
      'Chiffrer les moyens humains, déplacements, balisage, nacelle ou levage, glace, temps et sous-traitants nécessaires.',
      'Formaliser les exclusions, critères d’acceptation, interruption de production et conditions de reprise.',
      'Faire valider le prix, la marge, l’assurance et la procédure par la direction.',
      'Établir le rapport industriel et la traçabilité des paramètres si l’intervention est acceptée.'
    ]
  },
  autre: {
    key: 'autre-etude-v1', requestCategory: 'autre', vehicleType: 'autre', label: 'Procédure autre demande — qualification avant chiffrage', version: '1.0', defaultDurationDays: 1,
    checklist: [
      'Décrire précisément l’objet, son propriétaire, son usage, ses dimensions, ses matériaux et la zone demandée.',
      'Prendre des photographies et recueillir toute documentation disponible.',
      'Identifier les risques, incompatibilités, autorisations, moyens d’accès et contraintes de lieu.',
      'Ne pas transposer automatiquement une procédure voiture, moto, poids lourd, aéronautique ou industrielle.',
      'Définir un essai de compatibilité et une méthode spécifique avant le prix définitif.',
      'Chiffrer les moyens, consommables, durée, déplacement, sous-traitance et marge.',
      'Faire valider par la direction la prestation, le prix, les exclusions et la date.',
      'Conserver la décision et la procédure spécifique dans le dossier.'
    ]
  }
});

function normalizeType(value) {
  const text = String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!text) return '';
  for (const category of CATEGORIES) {
    if (category.key === text || category.aliases.some((alias) => text.includes(alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))) return category.key;
  }
  return 'autre';
}
function get(value) {
  const key = normalizeType(value);
  return key ? PROCEDURES[key] : null;
}
function list() { return CATEGORIES.map((category) => ({ ...PROCEDURES[category.key], categoryLabel: category.label, aliases: [...category.aliases] })); }
function categories() { return CATEGORIES.map((item) => ({ ...item, aliases: [...item.aliases] })); }
function snapshot(value) {
  const procedure = get(value);
  return procedure ? { ...procedure, checklist: [...procedure.checklist] } : null;
}

module.exports = { CATEGORIES, PROCEDURES, normalizeType, normalizeCategory: normalizeType, get, list, categories, snapshot };
