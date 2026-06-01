function isBrowserEnvironment() {
  return typeof window !== "undefined";
}

export function getStorageItem(key: string) {
  if (!isBrowserEnvironment()) {
    return null;
  }

  return window.localStorage.getItem(key);
}

export function setStorageItem(key: string, value: string) {
  if (!isBrowserEnvironment()) {
    return;
  }

  window.localStorage.setItem(key, value);
}

export function removeStorageItem(key: string) {
  if (!isBrowserEnvironment()) {
    return;
  }

  window.localStorage.removeItem(key);
}

