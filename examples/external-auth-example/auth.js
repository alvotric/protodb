import { createProtoDBClient } from "./vendor/auth-js/index.js";

// Local reference configuration. Point PROTODB_URL at a running ProtoDB
// server and register CALLBACK_URL in the project's Allowed Redirect URLs.
//
// The SDK copy under ./vendor/auth-js/ is generated from the canonical
// source in packages/auth-js (run `npm run build:auth-js` then
// `npm run sync:auth-example` to refresh it). It is vendored here so this
// directory can be served directly without exposing a parent directory.
export const PROTODB_URL = "http://localhost:3000";
export const PROJECT = "alvotric";
export const CALLBACK_URL = "http://localhost:8080/callback.html";

export function createClient() {
  return createProtoDBClient({ url: PROTODB_URL, project: PROJECT });
}

export function showError(message) {
  const el = document.getElementById("error");
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
}

export function setLoading(loading) {
  for (const button of document.querySelectorAll("button")) button.disabled = loading;
  const status = document.getElementById("status");
  if (status && loading) status.textContent = "Working…";
}
