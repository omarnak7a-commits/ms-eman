/**
 * Web Storage access that cannot take the whole SPA down.
 *
 * Reading `window.localStorage` is NOT safe on mobile browsers. In several
 * very common real-world configurations the property getter itself throws a
 * `SecurityError` (or `setItem` throws `QuotaExceededError`) before any value
 * is ever returned:
 *
 *  - iOS Safari with "Block All Cookies" enabled (Settings → Safari).
 *  - Android Chrome with site data blocked, and most in-app webviews
 *    (Facebook / Instagram / WhatsApp browsers) when third-party storage is
 *    partitioned off — students open exam links from chat apps, so this is the
 *    normal path into this product, not an edge case.
 *  - Private Browsing on older iOS, where the quota is zero.
 *
 * An unguarded `localStorage.getItem(...)` on the startup path therefore turns
 * into a blank page on exactly those devices while desktop works fine.
 *
 * The fallback below is a defined recovery, not error suppression: when
 * persistent storage is unavailable we keep the same key/value contract in
 * memory, so a session still works for the lifetime of the tab (enough to sit
 * one exam) and only fails to survive a reload.
 */

const memory = new Map<string, string>();
let persistentStorage: Storage | null | undefined;
let warned = false;

function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[storage] Persistent storage is unavailable in this browser ' +
      '(cookies/site data blocked?). Falling back to in-memory session storage.',
    err,
  );
}

/** Returns localStorage when it is actually usable, otherwise null. */
function getPersistentStorage(): Storage | null {
  if (persistentStorage !== undefined) return persistentStorage;
  try {
    const ls = window.localStorage;
    // Probe: some browsers expose the object but throw on write.
    const probe = '__ty_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    persistentStorage = ls;
  } catch (err) {
    warnOnce(err);
    persistentStorage = null;
  }
  return persistentStorage;
}

export function storageGet(key: string): string | null {
  const ls = getPersistentStorage();
  if (ls) {
    try {
      return ls.getItem(key);
    } catch (err) {
      warnOnce(err);
    }
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

export function storageSet(key: string, value: string): void {
  memory.set(key, value);
  const ls = getPersistentStorage();
  if (!ls) return;
  try {
    ls.setItem(key, value);
  } catch (err) {
    // Quota exceeded / storage revoked mid-session: the in-memory copy above
    // still keeps the current tab working.
    warnOnce(err);
  }
}

export function storageRemove(key: string): void {
  memory.delete(key);
  const ls = getPersistentStorage();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch (err) {
    warnOnce(err);
  }
}
