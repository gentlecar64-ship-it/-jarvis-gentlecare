(() => {
  'use strict';
  if (!window.GCOS) throw new Error('GCOS_CORE_REQUIRED');

  const api = () => window.GCOS.getService('api');

  function tablePath(table) {
    return `/api/airtable/tables/${encodeURIComponent(table)}`;
  }

  async function list(table, options = {}) {
    const params = new URLSearchParams();
    if (options.maxRecords) params.set('maxRecords', String(options.maxRecords));
    if (options.view) params.set('view', options.view);
    if (options.filterByFormula) params.set('filterByFormula', options.filterByFormula);
    const query = params.toString();
    return api().request(`${tablePath(table)}${query ? `?${query}` : ''}`);
  }

  async function create(table, fields) {
    return api().request(tablePath(table), {
      method: 'POST',
      body: { records: [{ fields }], typecast: true }
    });
  }

  async function update(table, recordId, fields) {
    return api().request(`${tablePath(table)}/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      body: { fields, typecast: true }
    });
  }

  async function search(table, text, options = {}) {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return [];
    const payload = await list(table, { maxRecords: options.maxRecords || 50, view: options.view });
    return (payload.records || []).filter(record =>
      JSON.stringify(record.fields || {}).toLowerCase().includes(normalized)
    );
  }

  const service = Object.freeze({ list, create, update, search });
  window.GCOS.registerService('airtable', service);
})();