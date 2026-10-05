import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  createProtoDBClient,
  memoryStorage,
  ProtoDBAuthError,
  challengeForVerifier,
  generateState,
  generateVerifier,
} from "../packages/auth-js/src/index.ts";

const URL_BASE = "http://localhost:3000";
const PROJECT = "alvotric";

function makeClient({ fetch: fetchFn, storage } = {}) {
  const { auth } = createProtoDBClient({
    url: URL_BASE,
    project: PROJECT,
    storage: storage ?? memoryStorage(),
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
  return auth;
}

function stubWindow({ href = `${URL_BASE}/`, assign = () => {} } = {}) {
  const url = new URL(href);
  globalThis.window = {
    location: {
      origin: url.origin,
      pathname: url.pathname,
      href,
      assign,
    },
  };
  return globalThis.window;
}

function unstubWindow() {
  delete globalThis.window;
}

function mockFetch(routes) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return handler(url, init);
  };
}

const TOKEN_OK = {
  access_token: "a".repeat(64),
  refresh_token: "b".repeat(64),
  token_type: "Bearer",
  expires_in: 3600,
  user: { id: "user-1", email: "user@example.com" },
};

test("PKCE matches the RFC 7636 test vector and generates valid values", async () => {
  assert.equal(
    await challengeForVerifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  );
  const verifier = await generateVerifier();
  assert.match(verifier, /^[A-Za-z0-9\-_]{43,128}$/);
  const challenge = await challengeForVerifier(verifier);
  assert.match(challenge, /^[A-Za-z0-9\-_]{43}$/);
  const state = generateState();
  assert.match(state, /^[0-9a-f]{32}$/);
  assert.notEqual(generateState(), generateState());
});

test("signInWithGoogle builds a correct authorize URL and stores PKCE state", async () => {
  let assigned = null;
  stubWindow({ assign: (url) => { assigned = url; } });
  try {
    const auth = makeClient();
    const { url } = await auth.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "app-state-1" });
    assert.equal(assigned, url);
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, `${URL_BASE}/api/projects/${PROJECT}/auth/v1/authorize`);
    assert.equal(parsed.searchParams.get("provider"), "google");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.example.com/cb");
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    assert.match(parsed.searchParams.get("code_challenge") ?? "", /^[A-Za-z0-9\-_]{43}$/);
    assert.equal(parsed.searchParams.get("state"), "app-state-1");
    assert.ok(!url.includes("secret"), "authorize URL must never carry secrets");
  } finally {
    unstubWindow();
  }
});

test("handleCallback exchanges code, validates state, and persists the session", async () => {
  stubWindow();
  try {
    let posted = null;
    const fetchFn = mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async (_url, init) => {
        posted = JSON.parse(init.body);
        return Response.json(TOKEN_OK);
      },
    });
    const auth = makeClient({ fetch: fetchFn });
    const { url } = await auth.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    const redirectTo = new URL(url).searchParams.get("redirect_uri");
    const callbackUrl = `https://app.example.com/cb?code=authcode123&state=s1`;
    const { session, user } = await auth.handleCallback({ url: callbackUrl, cleanupUrl: false });
    assert.equal(session.access_token, TOKEN_OK.access_token);
    assert.equal(user.email, "user@example.com");
    assert.ok(session.expires_at > Date.now());
    assert.deepEqual(posted?.grant_type, "authorization_code");
    assert.deepEqual(posted?.code, "authcode123");
    assert.deepEqual(posted?.redirect_uri, redirectTo);
    assert.match(posted?.code_verifier ?? "", /^[A-Za-z0-9\-_]{43,128}$/);
    const stored = await auth.getSession();
    assert.equal(stored?.access_token, TOKEN_OK.access_token);
  } finally {
    unstubWindow();
  }
});

test("handleCallback rejects provider errors and state mismatches", async () => {
  stubWindow();
  try {
    const auth = makeClient();
    await auth.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    await assert.rejects(
      auth.handleCallback({ url: "https://app.example.com/cb?error=access_denied&state=s1", cleanupUrl: false }),
      (error) => error instanceof ProtoDBAuthError && error.code === "access_denied"
    );
    await auth.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    await assert.rejects(
      auth.handleCallback({ url: "https://app.example.com/cb?code=c&state=wrong", cleanupUrl: false }),
      (error) => error instanceof ProtoDBAuthError && error.code === "state-mismatch"
    );
    assert.equal(await auth.getSession(), null);
  } finally {
    unstubWindow();
  }
});

test("getUser returns the server user with a Bearer token", async () => {
  stubWindow();
  try {
    const fetchFn = mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async () => Response.json(TOKEN_OK),
      [`GET /api/projects/${PROJECT}/auth/v1/user`]: async (_url, init) => {
        assert.equal(init.headers.Authorization, `Bearer ${TOKEN_OK.access_token}`);
        return Response.json({ user: { id: "user-1", email: "user@example.com", email_verified: true, name: "U" } });
      },
    });
    const auth = makeClient({ fetch: fetchFn });
    await auth.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    await auth.handleCallback({ url: "https://app.example.com/cb?code=c&state=s1", cleanupUrl: false });
    const user = await auth.getUser();
    assert.equal(user?.email_verified, true);
  } finally {
    unstubWindow();
  }
});

test("expired sessions refresh automatically; dead refresh tokens sign out", async () => {
  const events = [];
  const fetchFn = mockFetch({
    [`POST /api/projects/${PROJECT}/auth/v1/token`]: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.grant_type === "refresh_token") {
        return Response.json({ ...TOKEN_OK, access_token: "c".repeat(64) });
      }
      return Response.json({ ...TOKEN_OK, expires_in: 0 });
    },
  });
  const auth = makeClient({ fetch: fetchFn });
  auth.onAuthStateChange((event) => events.push(event));
  stubWindow();
  try {
    await auth.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    await auth.handleCallback({ url: "https://app.example.com/cb?code=c&state=s1", cleanupUrl: false });
  } finally {
    unstubWindow();
  }
  // Stored session is already expired (expires_in: 0) → getSession refreshes.
  const refreshed = await auth.getSession();
  assert.equal(refreshed?.access_token, "c".repeat(64));
  assert.ok(events.includes("TOKEN_REFRESHED"));

  // Dead refresh token: server rejects → local state clears, signed out.
  const deadEvents = [];
  const dead = makeClient({
    fetch: mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async (_url, init) => {
        const body = JSON.parse(init.body);
        if (body.grant_type === "refresh_token") {
          return Response.json({ error: "invalid_grant", error_description: "bad" }, { status: 401 });
        }
        return Response.json({ ...TOKEN_OK, expires_in: 0 });
      },
    }),
  });
  dead.onAuthStateChange((event) => deadEvents.push(event));
  stubWindow();
  try {
    await dead.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    await dead.handleCallback({ url: "https://app.example.com/cb?code=c&state=s1", cleanupUrl: false });
  } finally {
    unstubWindow();
  }
  assert.equal(await dead.getSession(), null);
  assert.ok(deadEvents.includes("SIGNED_OUT"));
});

test("missing sessions return null and logout always clears local state", async () => {
  const auth = makeClient();
  assert.equal(await auth.getSession(), null);
  assert.equal(await auth.getUser(), null);
  let called = 0;
  const fetchFn = mockFetch({
    [`POST /api/projects/${PROJECT}/auth/v1/token`]: async () => Response.json(TOKEN_OK),
    [`POST /api/projects/${PROJECT}/auth/v1/logout`]: async () => {
      called += 1;
      return Response.json({ ok: true });
    },
  });
  const events = [];
  const auth2 = makeClient({ fetch: fetchFn });
  auth2.onAuthStateChange((event) => events.push(event));
  stubWindow();
  try {
    await auth2.signInWithGoogle({ redirectTo: "https://app.example.com/cb", state: "s1" });
    await auth2.handleCallback({ url: "https://app.example.com/cb?code=c&state=s1", cleanupUrl: false });
  } finally {
    unstubWindow();
  }
  await auth2.signOut();
  assert.equal(called, 1);
  assert.equal(await auth2.getSession(), null);
  assert.ok(events.includes("SIGNED_OUT"));

  // Server unreachable: local state still clears.
  const auth3 = makeClient({
    fetch: async () => { throw new Error("down"); },
  });
  stubWindow();
  try {
    await assert.rejects(auth3.signInWithGoogle({ redirectTo: "https://x.example/" }).then(() => auth3.handleCallback({ url: "https://x.example/?code=c&state=nope", cleanupUrl: false })));
  } finally {
    unstubWindow();
  }
});

test("browser-facing SDK code contains no secrets", () => {
  const dir = new URL("../packages/auth-js/src/", import.meta.url);
  const forbidden = ["client_secret", "clientSecret", "GOOGLE_CLIENT_SECRET", "refresh_token_hash", "BEGIN PRIVATE"];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(new URL(file, dir), "utf8");
    for (const needle of forbidden) {
      assert.ok(!source.includes(needle), `${file} must not contain ${needle}`);
    }
  }
});
