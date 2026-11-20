'use strict';

const base = require('./quote-workflow-current');
const interventionReport = require('./intervention-report');
const originalTransition = base.transition.bind(base);

function transition(store, quoteReference, action, payload = {}, user = {}) {
  const result = originalTransition(store, quoteReference, action, payload, user);
  if (action !== 'complete') return result;

  const intervention = result?.data?.intervention;
  if (!intervention?.id) return result;
  const legacyReportId = result.data.quote?.reportId || '';
  const generated = interventionReport.generate(store, intervention.id, payload.report || payload.reportData || {}, user);
  if (legacyReportId && legacyReportId !== generated.document.id) {
    try {
      store.update('documents', legacyReportId, {
        status: 'Remplacé par le rapport de référence versionné',
        supersededBy: generated.document.id,
        supersededAt: new Date().toISOString()
      });
    } catch {}
  }
  const quote = result.data.quote?.id
    ? store.update('quotes', result.data.quote.id, {
      reportId: generated.document.id,
      reportUrl: generated.htmlUrl,
      reportJsonUrl: generated.jsonUrl,
      reportVersion: generated.report.version,
      workflowStatus: 'Rapport et facture à valider'
    })
    : result.data.quote;
  const refreshedIntervention = store.list('interventions').find((item) => item.id === intervention.id) || intervention;
  result.data = { ...result.data, quote, intervention: refreshedIntervention, report: generated.report, reportDocument: generated.document, reportUrl: generated.htmlUrl, reportJsonUrl: generated.jsonUrl };
  result.links = [
    ...(Array.isArray(result.links) ? result.links : []),
    { label: `Ouvrir le rapport ${generated.report.reportNumber} v${generated.report.version}.0`, url: generated.htmlUrl }
  ];
  result.answer = `${result.answer} Le rapport technique de référence ${generated.report.reportNumber}, version ${generated.report.version}.0, a été généré en brouillon bloqué avec ses 12 sections. ${generated.report.completeness.missing.length ? `Il reste ${generated.report.completeness.missing.length} élément(s) à compléter avant validation.` : 'Les champs structurants sont renseignés ; la validation humaine reste obligatoire.'}`;
  return result;
}

base.transition = transition;
base.interventionReport = interventionReport;

module.exports = { ...base, transition, interventionReport };
