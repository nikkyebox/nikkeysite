const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

class SafeStorage {
  private isAvailable: boolean;
  private fallback: Record<string, string> = {};

  constructor() {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      this.isAvailable = true;
    } catch (e) {
      this.isAvailable = false;
      devWarn('localStorage is not available. Using in-memory fallback.', e);
    }
  }

  getItem(key: string): string | null {
    if (this.isAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        devError(`Error reading key "${key}" from localStorage:`, e);
      }
    }
    return this.fallback[key] !== undefined ? this.fallback[key] : null;
  }

  setItem(key: string, value: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        devError(`Error writing key "${key}" to localStorage:`, e);
      }
    }
    this.fallback[key] = value;
  }

  removeItem(key: string): void {
    if (this.isAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        devError(`Error removing key "${key}" from localStorage:`, e);
      }
    }
    delete this.fallback[key];
  }

  clear(): void {
    if (this.isAvailable) {
      try {
        window.localStorage.clear();
        return;
      } catch (e) {
        devError('Error clearing localStorage:', e);
      }
    }
    this.fallback = {};
  }

  // Retorna as chaves REAIS armazenadas (não os campos da classe).
  keys(): string[] {
    if (this.isAvailable) {
      try {
        return Object.keys(window.localStorage);
      } catch (e) {
        devError('Error reading localStorage keys:', e);
      }
    }
    return Object.keys(this.fallback);
  }
}

export const safeStorage = new SafeStorage();
