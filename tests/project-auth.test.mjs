import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeRequestContext,
  parseRequestContext,
} from "../lib/project-auth/authorize.ts";
import {
  pkceChallengeForVerifier,
  validateCodeChallenge,
  validateCodeVerifier,
  verifyPkceChallenge,
} from "../lib/project-auth/pkce.ts";
import {
  matchRedirectUri,
  validateGoogleClientId,
  validateRedirectUrl,
  validateRedirectUrlList,
} from "../lib/project-auth/providers.ts";
import { ProjectAuthError, validateProjectName, validateProjectSlug } from "../lib/project-auth/scope.ts";
import { bearerTokenFromHeader, generateProjectToken, hashProjectToken } from "../lib/project-auth/tokens.ts";
import { decideProjectUpsert } from "../lib/project-auth/mapping.ts";

test("project slugs and names are strictly validated", () => {
  assert.equal(validateProjectSlug("my-app"), "my-app");
  assert.equal(validateProjectSlug("  Acme-1 "), "acme-1");
  assert.throws(() => validateProjectSlug("ab"), ProjectAuthError);
  assert.throws(() => validateProjectSlug("Upper_Case!"), ProjectAuthError);
  assert.throws(() => validateProjectSlug(""), ProjectAuthError);
  assert.throws(() => validateProjectSlug(42), ProjectAuthError);
  try {
    validateProjectSlug("../escape");
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(error instanceof ProjectAuthError);
    assert.equal(error.status, 404);
  }
  assert.equal(validateProjectName(" Acme App "), "Acme App");
  assert.throws(() => validateProjectName(""), /between 1 and 100/);
  assert.throws(() => validateProjectName("x".repeat(101)), /between 1 and 100/);
});

test("PKCE S256 challenges validate and verify end to end", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = pkceChallengeForVerifier(verifier);
  assert.equal(validateCodeChallenge(challenge), challenge);
  assert.equal(validateCodeVerifier(verifier), verifier);
  assert.equal(verifyPkceChallenge(verifier, challenge), true);
  assert.equal(verifyPkceChallenge(`${verifier}x`.slice(0, 44), challenge), false);
  assert.throws(() => validateCodeChallenge("short"), /base64url/);
  assert.throws(() => validateCodeChallenge("has space in it padding===="), /base64url/);
  assert.throws(() => validateCodeVerifier("has spaces in it"), /invalid/);
});

test("redirect URLs require https (or loopback) and match exactly", () => {
  assert.equal(validateRedirectUrl("https://app.example.com/auth/callback"), "https://app.example.com/auth/callback");
  assert.equal(validateRedirectUrl("http://localhost:3000/cb"), "http://localhost:3000/cb");
  assert.throws(() => validateRedirectUrl("http://app.example.com/cb"), /HTTPS/);
  assert.throws(() => validateRedirectUrl("https://user:pass@app.example.com/"), /credentials/);
  assert.throws(() => validateRedirectUrl("https://app.example.com/#frag"), /fragments/);
  assert.throws(() => validateRedirectUrl("not-a-url"), /valid URL/);
  const allowed = validateRedirectUrlList(["https://app.example.com/cb", "http://localhost:3000/cb"]);
  assert.equal(matchRedirectUri(allowed, "https://app.example.com/cb"), true);
  assert.equal(matchRedirectUri(allowed, "https://app.example.com/cb?extra=1"), false);
  assert.equal(matchRedirectUri(allowed, "https://app.example.com/cb/"), false);
  assert.equal(matchRedirectUri(allowed, "https://evil.example.com/cb"), false);
  assert.throws(() => validateRedirectUrlList("nope"), /array/);
  assert.throws(
    () => validateRedirectUrlList(["https://a.example/cb", "https://a.example/cb"]),
    /duplicate/
  );
  assert.equal(validateGoogleClientId("  google-id.apps.googleusercontent.com "), "google-id.apps.googleusercontent.com");
  assert.throws(() => validateGoogleClientId(""), /between 1 and 512/);
});

test("authorize request context round-trips and rejects tampering", () => {
  const ctx = {
    projectId: "123e4567-e89b-42d3-a456-426614174000",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    appState: "opaque-app-state",
  };
  assert.deepEqual(parseRequestContext(encodeRequestContext(ctx)), ctx);
  assert.equal(parseRequestContext("!!!not-base64!!!"), null);
  assert.equal(parseRequestContext("e30="), null);
  assert.equal(parseRequestContext(null), null);
  assert.equal(parseRequestContext("x".repeat(5000)), null);
  const noState = { ...ctx, appState: null };
  assert.deepEqual(parseRequestContext(encodeRequestContext(noState)), noState);
});

test("project tokens are opaque, hashed deterministically, and parsed strictly", () => {
  const token = generateProjectToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(hashProjectToken(token), hashProjectToken(token));
  assert.notEqual(hashProjectToken(token), token);
  assert.equal(bearerTokenFromHeader(`Bearer ${token}`), token);
  assert.equal(bearerTokenFromHeader("Bearer short"), null);
  assert.equal(bearerTokenFromHeader("Basic abc"), null);
  assert.equal(bearerTokenFromHeader(null), null);
});

test("project login mapping logs linked users in and provisions the rest", () => {
  const active = {
    id: "u1", projectId: "p1", email: "a@x.test", emailVerified: true, name: "A", status: "active",
  };
  const suspended = { ...active, status: "suspended" };
  assert.deepEqual(decideProjectUpsert({ linkedUser: { ...active } }), { kind: "login", user: { ...active } });
  assert.deepEqual(decideProjectUpsert({ linkedUser: { ...suspended } }), { kind: "reject", reason: "suspended" });
  assert.deepEqual(decideProjectUpsert({ linkedUser: null }), { kind: "provision" });
});
