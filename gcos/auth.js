(() => {
  'use strict';
  if (!window.GCOS) throw new Error('GCOS_CORE_REQUIRED');

  const SESSION_KEY = 'jarvis-session';
  const ACCOUNTS_KEY = 'jarvis-accounts';
  const ROLES = Object.freeze({ ADMIN: 'admin', DIRECTION: 'direction', EMPLOYEE: 'employee' });

  function readJson(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }

  function currentUser() {
    const session = readJson(sessionStorage, SESSION_KEY, null);
    const accounts = readJson(localStorage, ACCOUNTS_KEY, []);
    if (!session?.id) return null;
    const account = accounts.find((item) => item.id === session.id);
    if (!account) return null;
    return {
      id: account.id,
      name: account.name || 'Utilisateur',
      role: account.role || ROLES.EMPLOYEE,
      permissions: Array.isArray(account.permissions) ? account.permissions : []
    };
  }

  function can(permission) {
    const user = currentUser();
    if (!user) return false;
    if (user.role === ROLES.ADMIN || user.role === ROLES.DIRECTION) return true;
    return user.permissions.includes(permission);
  }

  function requirePermission(permission) {
    if (!can(permission)) throw new Error(`GCOS_PERMISSION_DENIED:${permission}`);
    return true;
  }

  function refresh() {
    const user = currentUser();
    window.GCOS.setUser(user);
    return user;
  }

  const service = Object.freeze({ ROLES, currentUser, can, requirePermission, refresh });
  window.GCOS.registerService('auth', service);
  refresh();
})();
