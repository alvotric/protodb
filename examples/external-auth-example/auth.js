import { createProtoDBClient } from "../../packages/auth-js/dist/index.js";

// Local reference configuration. Point PROTODB_URL at a running ProtoDB
// server and register CALLBACK_URL in the project's Allowed Redirect URLs.
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
