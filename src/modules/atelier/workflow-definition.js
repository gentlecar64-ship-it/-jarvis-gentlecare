export const CRYO_DINITROL_WORKFLOW_ID = 'atelier.cryo-dinitrol.v1';

export function registerCryoDinitrolWorkflow(workflows) {
  return workflows.define({
    id: CRYO_DINITROL_WORKFLOW_ID,
    name: 'Intervention Cryo + Dinitrol',
    steps: [
      { id: 'reception', name: 'Accueil et prise en charge', requiredEvidence: ['clientId', 'vehicleId', 'mileage'] },
      { id: 'photos-before', name: 'Photos avant intervention', requiredEvidence: ['photos'] },
      { id: 'inspection', name: 'Inspection initiale', requiredEvidence: ['corrosion', 'leaks', 'generalCondition'] },
      { id: 'cryo-cleaning', name: 'Cryonettoyage', requiredEvidence: ['machine', 'operator', 'dryIceKg', 'pressureBar', 'durationMinutes'] },
      { id: 'quality-control', name: 'Contrôle qualité', requiredEvidence: ['zones', 'photos'] },
      { id: 'dinitrol', name: 'Application Dinitrol', requiredEvidence: ['products', 'operator', 'startedAt', 'finishedAt'] },
      { id: 'photos-after', name: 'Photos finales', requiredEvidence: ['photos'] },
      { id: 'report', name: 'Rapport et certificat', requiredEvidence: ['reportId'] },
      { id: 'delivery', name: 'Livraison du véhicule', requiredEvidence: ['paymentStatus', 'reportSent', 'customerSignature', 'deliveredAt'] },
    ],
  });
}

export function validateRequiredEvidence({ step, evidence }) {
  const required = step.requiredEvidence ?? [];
  return required.every((field) => {
    const value = evidence[field];
    return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
  });
}
