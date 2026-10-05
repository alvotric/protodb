import type { AuthStorage } from "./types.ts";
/** localStorage when available, in-memory otherwise. Never touches window at import time. */
export declare function defaultStorage(): AuthStorage;
export declare function memoryStorage(): AuthStorage;
