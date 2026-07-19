'use strict';

const quoteWorkflow = require('./quote-workflow');

const TERMS_URL = 'https://www.gentlecare.fr/conditionsgenerales';
const PRIVACY_URL = 'https://www.gentlecare.fr/politiquedeconfidentialit%C3%A9';
const LEGAL_URL = 'https://www.gentlecare.fr/about-1';
const COMPANY_LEGAL_FOOTER = 'GentleCarE · ZA Lantegia, 64990 Villefranque · RCS Bayonne 105 817 647 · SIRET 105 817 647 00016 · Capital publié : 10 000 €';

function safeList(store, collection) { try { return store.list(collection) || []; } catch { return []; } }
function applyInvoiceLegalRecord(store, quote = {}, intervention = {}, user = {}) {
  const invoice = safeList(store, 'documents').find((document) => document.id === quote.invoiceId || (document.quoteId === quote.id && document.category === 'Facture'));
  if (!invoice) return null;
  const termsStatus = quote.termsAccepted ? `CGV acceptées le ${quote.termsAcceptedAt || 'date conservée dans le dossier'} par ${quote.termsAcceptedBy || 'client ou représentant renseigné'}` : 'CGV non marquées comme acceptées dans MAVIK — contrôle obligatoire avant émission définitive';
  const content = [
    `FACTURE À GÉNÉRER — ${intervention.number || quote.number || ''}`,
    `Montant TTC : ${Number(invoice.amountTtc || quote.totalTtc || 0).toLocaleString('fr-FR', { style:'currency', currency:'EUR' })}`,
    `Solde TTC : ${Number(invoice.balanceTtc || quote.balanceTtc || 0).toLocaleString('fr-FR', { style:'currency', currency:'EUR' })}`,
    '', COMPANY_LEGAL_FOOTER,
    `Conditions générales : ${TERMS_URL}`,
    `Mentions légales : ${LEGAL_URL}`,
    `Confidentialité : ${PRIVACY_URL}`,
    termsStatus,
    'Document préparé par MAVIK. Validation comptable et direction obligatoire avant envoi.'
  ].join('\n');
  return store.update('documents', invoice.id, {
    content,
    legalFooter:COMPANY_LEGAL_FOOTER,
    termsUrl:TERMS_URL,
    privacyUrl:PRIVACY_URL,
    legalNoticeUrl:LEGAL_URL,
    termsAccepted:Boolean(quote.termsAccepted),
    termsAcceptedAt:quote.termsAcceptedAt || '',
    termsAcceptedBy:quote.termsAcceptedBy || '',
    technicalMediaAuthorized:Boolean(quote.technicalMediaAuthorized),
    commercialMediaAuthorized:Boolean(quote.commercialMediaAuthorized),
    identifiableMediaAuthorized:Boolean(quote.identifiableMediaAuthorized),
    legalRecordAppliedAt:new Date().toISOString(),
    legalRecordAppliedBy:user.name || user.id || 'MAVIK'
  });
}

if (!quoteWorkflow.__mavikLegalDocumentHooked) {
  const originalTransition = quoteWorkflow.transition.bind(quoteWorkflow);
  quoteWorkflow.transition = function transitionWithLegalDocuments(store, quoteReference, action, payload = {}, user = {}) {
    const result = originalTransition(store, quoteReference, action, payload, user);
    if (action === 'complete' && result?.data?.quote) result.data.invoice = applyInvoiceLegalRecord(store, result.data.quote, result.data.intervention || {}, user);
    return result;
  };
  quoteWorkflow.__mavikLegalDocumentHooked = true;
}

module.exports = { TERMS_URL, PRIVACY_URL, LEGAL_URL, COMPANY_LEGAL_FOOTER, applyInvoiceLegalRecord };
