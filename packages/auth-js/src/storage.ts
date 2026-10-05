import type { AuthStorage } from "./types.ts";

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && typeof localStorage.getItem === "function";
  } catch {
    return false;
  }
}

class MemoryStorage implements AuthStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key) as string : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class LocalStorageAdapter implements AuthStorage {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode / quota: session stays in memory for this page load.
    }
  }
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore: nothing more we can do.
    }
  }
}

/** localStorage when available, in-memory otherwise. Never touches window at import time. */
export function defaultStorage(): AuthStorage {
  return hasLocalStorage() ? new LocalStorageAdapter() : new MemoryStorage();
}

export function memoryStorage(): AuthStorage {
  return new MemoryStorage();
}
