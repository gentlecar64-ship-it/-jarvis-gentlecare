'use strict';

const PROCEDURES = Object.freeze({
  automobile: {
    key: 'automobile-standard-v1',
    vehicleType: 'automobile',
    label: 'Procédure atelier automobile — Cryo + protection',
    version: '1.0',
    checklist: [
      'Identifier le véhicule, contrôler l’immatriculation, le VIN communiqué et le kilométrage.',
      'Effectuer les photographies horodatées de réception et relever les réserves visibles.',
      'Valider avec le client les zones traitées, exclusions et démontages autorisés.',
      'Sécuriser le véhicule sur le pont ou le dispositif de levage adapté et contrôler les quatre points de levage.',
      'Déposer uniquement les protections et roues prévues au devis ; identifier chaque élément déposé.',
      'Protéger l’électronique sensible, les prises d’air, les freins, les échappements chauds et les surfaces incompatibles.',
      'Réaliser un essai cryogénique sur une zone discrète avant traitement général.',
      'Traiter méthodiquement le dessous, le moteur si prévu, les quatre passages de roue et les zones détaillées au devis.',
      'Documenter la pression, les buses, le temps de travail, la consommation de glace et les anomalies révélées.',
      'Préparer les supports puis masquer les zones exclues avant application Dinitrol.',
      'Tracer les produits, numéros de lots, quantités, corps creux et temps de séchage.',
      'Remonter, serrer et contrôler les éléments déposés selon les prescriptions applicables.',
      'Réaliser les photographies comparables avant/après, le contrôle final et le rapport de référence du véhicule.'
    ]
  },
  moto: {
    key: 'moto-standard-v1',
    vehicleType: 'moto',
    label: 'Procédure atelier moto — Cryo + protection adaptée',
    version: '1.0',
    checklist: [
      'Identifier la moto, contrôler l’immatriculation, le VIN communiqué et le kilométrage.',
      'Effectuer les photographies horodatées de réception et relever les réserves visibles.',
      'Valider avec le client les zones traitées, exclusions, accessoires et démontages autorisés.',
      'Stabiliser la moto sur une plateforme, béquille ou lève-moto adapté ; contrôler les points d’appui sans utiliser une procédure automobile.',
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
  }
});

function normalizeType(value) {
  const text = String(value || '').trim().toLowerCase();
  return /moto|motocycle|scooter|deux.?roues/.test(text) ? 'moto' : 'automobile';
}
function get(value) { return PROCEDURES[normalizeType(value)]; }
function list() { return Object.values(PROCEDURES); }
function snapshot(value) {
  const procedure = get(value);
  return { ...procedure, checklist: [...procedure.checklist] };
}

module.exports = { PROCEDURES, normalizeType, get, list, snapshot };
