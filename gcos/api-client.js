(() => {
  'use strict';
  if (!window.GCOS) throw new Error('GCOS_CORE_REQUIRED');

  const DEFAULT_SERVER = 'http://127.0.0.1:4782';
  const STORAGE_KEY = 'gcos-server-url';

  function baseUrl() {
    return (localStorage.getItem(STORAGE_KEY) || DEFAULT_SERVER).replace(/\/$/, '');
  }

  function setBaseUrl(url) {
    const clean = String(url || '').trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(clean)) throw new Error('GCOS_SERVER_URL_INVALID');
    localStorage.setItem(STORAGE_KEY, clean);
    window.GCOS.emit('api:configured', { baseUrl: clean });
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 7000);
    try {
      const response = await fetch(`${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-GCOS-Client': 'web',
          ...(options.headers || {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `GCOS_API_${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function health() {
    try {
      const result = await request('/health', { timeoutMs: 1800 });
      window.GCOS.emit('api:online', result);
      return { online: true, ...result };
    } catch (error) {
      window.GCOS.emit('api:offline', { message: error.message });
      return { online: false, error: error.message };
    }
  }

  const service = Object.freeze({ baseUrl, setBaseUrl, request, health });
  window.GCOS.registerService('api', service);
})();
