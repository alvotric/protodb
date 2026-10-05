import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import {
  buildAuthorizationUrl,
  decideGoogleLogin,
  encodeIntentCookie,
  generateOAuthState,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  OAuthCallbackError,
  parseCallbackParams,
  parseIntentCookie,
  statesEqual,
  verifyGoogleIdToken,
} from "../lib/auth/google.ts";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintIdToken({ privateKeyPem, kid = "test-kid", payload = {} }) {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = base64Url(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: "google-sub-123",
    email: "User@Example.Test",
    email_verified: true,
    name: "Test User",
    ...payload,
  }));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${body}`, "utf8"), createPrivateKey(privateKeyPem));
  const sigB64 = signature.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${sigB64}`;
}

function testKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return { privatePem, certB64: publicDer.toString("base64") };
}

test("OAuth state is unique, correctly shaped, and compared in constant time", () => {
  const a = generateOAuthState();
  const b = generateOAuthState();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  assert.equal(statesEqual(a, a), true);
  assert.equal(statesEqual(a, b), false);
  assert.equal(statesEqual(a, null), false);
  assert.equal(statesEqual("short", "short"), false);
  assert.equal(statesEqual("x".repeat(64), "y".repeat(64)), false);
});

test("authorization URL carries this app's client, redirect, scopes, and state", () => {
  const url = new URL(buildAuthorizationUrl(
    { clientId: CLIENT_ID, clientSecret: "secret", redirectUri: "http://localhost:3000/api/auth/google/callback" },
    "abc123state"
  ));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/google/callback");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "abc123state");
  assert.ok(!url.search.includes("secret"), "client secret must never appear in the redirect URL");
});

test("intent cookies round-trip login and bound link intents, rejecting the rest", () => {
  assert.deepEqual(parseIntentCookie(encodeIntentCookie({ kind: "login" })), { kind: "login" });
  const link = encodeIntentCookie({ kind: "link", userId: "123e4567-e89b-42d3-a456-426614174000" });
  assert.deepEqual(parseIntentCookie(link), { kind: "link", userId: "123e4567-e89b-42d3-a456-426614174000" });
  assert.equal(parseIntentCookie("link:not-a-uuid"), null);
  assert.equal(parseIntentCookie("link:"), null);
  assert.equal(parseIntentCookie("admin"), null);
  assert.equal(parseIntentCookie(null), null);
  assert.equal(parseIntentCookie(42), null);
});

test("callback query parsing separates code, state, and provider errors", () => {
  const ok = parseCallbackParams(new URLSearchParams("code=authcode&state=xyz"));
  assert.equal(ok.code, "authcode");
  assert.equal(ok.state, "xyz");
  assert.equal(ok.providerError, null);
  const denied = parseCallbackParams(new URLSearchParams("error=access_denied&state=xyz"));
  assert.equal(denied.providerError, "access_denied");
  assert.equal(denied.code, null);
});

test("Google config comes from server env only and reports availability", () => {
  const saved = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  };
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    assert.equal(getGoogleOAuthConfig(), null);
    assert.equal(isGoogleOAuthConfigured(), false);
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";
    assert.deepEqual(getGoogleOAuthConfig(), {
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost:3000/api/auth/google/callback",
    });
    assert.equal(isGoogleOAuthConfigured(), true);
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.equal(getGoogleOAuthConfig(), null);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("valid Google ID token verifies with normalized email", async () => {
  const { privatePem, certB64 } = testKeypair();
  const token = mintIdToken({ privateKeyPem: privatePem });
  const identity = await verifyGoogleIdToken(token, {
    clientId: CLIENT_ID,
    jwksKeys: [{ kid: "test-kid", x5c: [certB64] }],
  });
  assert.equal(identity.sub, "google-sub-123");
  assert.equal(identity.email, "user@example.test");
  assert.equal(identity.emailVerified, true);
  assert.equal(identity.name, "Test User");
});

test("ID token verification fails closed on wrong audience, issuer, expiry, and signature", async () => {
  const { privatePem, certB64 } = testKeypair();
  const keys = [{ kid: "test-kid", x5c: [certB64] }];
  const other = testKeypair();
  const otherKeys = [{ kid: "test-kid", x5c: [other.certB64] }];

  await assert.rejects(
    verifyGoogleIdToken(mintIdToken({ privateKeyPem: privatePem, payload: { aud: "someone-else" } }), { clientId: CLIENT_ID, jwksKeys: keys }),
    (error) => error instanceof OAuthCallbackError && /issued to this application/.test(error.message)
  );
  await assert.rejects(
    verifyGoogleIdToken(mintIdToken({ privateKeyPem: privatePem, payload: { iss: "https://evil.example" } }), { clientId: CLIENT_ID, jwksKeys: keys }),
    (error) => error instanceof OAuthCallbackError && /issuer/.test(error.message)
  );
  await assert.rejects(
    verifyGoogleIdToken(mintIdToken({ privateKeyPem: privatePem, payload: { exp: Math.floor(Date.now() / 1000) - 600 } }), { clientId: CLIENT_ID, jwksKeys: keys }),
    (error) => error instanceof OAuthCallbackError && /expired/.test(error.message)
  );
  await assert.rejects(
    verifyGoogleIdToken(mintIdToken({ privateKeyPem: privatePem }), { clientId: CLIENT_ID, jwksKeys: otherKeys }),
    (error) => error instanceof OAuthCallbackError && /signature/.test(error.message)
  );
  await assert.rejects(
    verifyGoogleIdToken(mintIdToken({ privateKeyPem: privatePem, payload: { email_verified: false } }), { clientId: CLIENT_ID, jwksKeys: keys }),
    (error) => error instanceof OAuthCallbackError && /not verified/.test(error.message)
  );
  await assert.rejects(
    verifyGoogleIdToken("not.a.jwt", { clientId: CLIENT_ID, jwksKeys: keys }),
    OAuthCallbackError
  );
});

test("login mapping prefers linked identity and never merges on email alone", () => {
  assert.deepEqual(
    decideGoogleLogin({ linkedUser: { id: "u1", email: "a@x.test", status: "active" }, emailMatchedUser: null, usersEmpty: false }),
    { kind: "login", userId: "u1" }
  );
  assert.deepEqual(
    decideGoogleLogin({ linkedUser: { id: "u1", email: "a@x.test", status: "suspended" }, emailMatchedUser: null, usersEmpty: false }),
    { kind: "reject", reason: "suspended" }
  );
  assert.deepEqual(
    decideGoogleLogin({ linkedUser: null, emailMatchedUser: null, usersEmpty: true }),
    { kind: "bootstrap" }
  );
  assert.deepEqual(
    decideGoogleLogin({ linkedUser: null, emailMatchedUser: { id: "u2", email: "a@x.test", status: "active" }, usersEmpty: false }),
    { kind: "reject", reason: "email-conflict" }
  );
  assert.deepEqual(
    decideGoogleLogin({ linkedUser: null, emailMatchedUser: { id: "u2", email: "a@x.test", status: "suspended" }, usersEmpty: false }),
    { kind: "reject", reason: "suspended" }
  );
  assert.deepEqual(
    decideGoogleLogin({ linkedUser: null, emailMatchedUser: null, usersEmpty: false }),
    { kind: "reject", reason: "no-account" }
  );
});
