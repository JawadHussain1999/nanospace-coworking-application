function getStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function readDemoValue(key) {
  return getStorage()?.getItem(key) ?? null;
}

export function writeDemoValue(key, value) {
  const storage = getStorage();
  if (!storage) throw new Error('Browser storage is unavailable.');
  storage.setItem(key, value);
}

export function removeDemoValue(key) {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(key);
}

export function readDemoJson(key) {
  const value = readDemoValue(key);
  return value === null ? null : JSON.parse(value);
}

export function writeDemoJson(key, value) {
  writeDemoValue(key, JSON.stringify(value));
}
