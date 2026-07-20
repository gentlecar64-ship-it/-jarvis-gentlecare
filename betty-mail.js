(() => {
  'use strict';

  const ACCOUNT = 'benedicte@gentlecare.fr';
  const state = {
    filter: 'all',
    messages: JSON.parse(localStorage.getItem('betty-mail-demo') || '[]')
  };

  const rules = {
    priority: ['urgent', 'banque', 'impayé', 'échéance', 'devis accepté', 'commande bloquée'],
    finance: ['facture', 'banque', 'comptable', 'paiement', 'prélèvement'],
    supplier: ['dinitrol', 'fournisseur', 'livraison', 'commande'],
    client: ['devis', 'véhicule', 'rendez-vous', 'intervention']
  };

  function classify(message) {
    const text = `${message.from || ''} ${message.subject || ''} ${message.snippet || ''}`.toLowerCase();
    const tags = [];
    Object.entries(rules).forEach(([tag, words]) => {
      if (words.some(word => text.includes(word))) tags.push(tag);
    });
    if (message.replyExpected) tags.push('reply');
    return [...new Set(tags)];
  }

  function reasonFor(message) {
    if (message.tags.includes('priority')) return 'Betty : priorité détectée à cause du sujet ou d’une échéance.';
    if (message.tags.includes('reply')) return 'Betty : une réponse semble attendue.';
    return 'Betty : message classé pour faciliter le suivi.';
  }

  function render() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const messages = state.messages.map(item => ({...item, tags: classify(item)}));
    const visible = messages.filter(item => {
      const matchesFilter = state.filter === 'all' || item.tags.includes(state.filter);
      const haystack = `${item.from || ''} ${item.subject || ''} ${item.snippet || ''}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });

    document.getElementById('messageList').innerHTML = visible.map(item => `
      <article class="message ${item.tags.includes('priority') ? 'priority' : ''}">
        <span class="signal" aria-hidden="true"></span>
        <div>
          <h4>${escapeHtml(item.subject || 'Sans objet')}</h4>
          <p><strong>${escapeHtml(item.from || 'Expéditeur inconnu')}</strong></p>
          <p>${escapeHtml(item.snippet || '')}</p>
          <div class="tags">${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
          <p class="reason">${escapeHtml(reasonFor(item))}</p>
        </div>
        <time>${escapeHtml(item.date || '')}</time>
      </article>`).join('');

    document.getElementById('emptyState').classList.toggle('hidden', visible.length > 0);
    document.getElementById('unreadCount').textContent = messages.filter(item => item.unread).length;
    document.getElementById('priorityCount').textContent = messages.filter(item => item.tags.includes('priority')).length;
    document.getElementById('replyCount').textContent = messages.filter(item => item.tags.includes('reply')).length;
    document.getElementById('draftCount').textContent = JSON.parse(localStorage.getItem('betty-mail-drafts') || '[]').length;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }

  document.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      state.filter = button.dataset.filter;
      render();
    });
  });

  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('refreshButton').addEventListener('click', render);
  document.getElementById('configureButton').addEventListener('click', () => {
    alert(`Connexion sécurisée à configurer pour ${ACCOUNT}. Aucun mot de passe ni jeton ne doit être stocké dans GitHub Pages.`);
  });

  document.getElementById('briefingText').textContent = `Compte cible : ${ACCOUNT}. L’interface est prête ; la synchronisation réelle nécessitera le connecteur OAuth MAVIK.`;
  render();
})();