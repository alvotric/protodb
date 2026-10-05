function hasLocalStorage() {
    try {
        return typeof localStorage !== "undefined" && typeof localStorage.getItem === "function";
    }
    catch {
        return false;
    }
}
class MemoryStorage {
    constructor() {
        this.map = new Map();
    }
    getItem(key) {
        return this.map.has(key) ? this.map.get(key) : null;
    }
    setItem(key, value) {
        this.map.set(key, value);
    }
    removeItem(key) {
        this.map.delete(key);
    }
}
class LocalStorageAdapter {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        }
        catch {
            return null;
        }
    }
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch {
            // Private mode / quota: session stays in memory for this page load.
        }
    }
    removeItem(key) {
        try {
            localStorage.removeItem(key);
        }
        catch {
            // Ignore: nothing more we can do.
        }
    }
}
/** localStorage when available, in-memory otherwise. Never touches window at import time. */
export function defaultStorage() {
    return hasLocalStorage() ? new LocalStorageAdapter() : new MemoryStorage();
}
export function memoryStorage() {
    return new MemoryStorage();
}
