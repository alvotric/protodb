import test from "node:test";
import assert from "node:assert/strict";
import {
  createProtoDBClient,
  memoryStorage,
  ProtoDBAuthError,
} from "../packages/auth-js/src/index.ts";

const URL_BASE = "http://localhost:3000";
const PROJECT = "alvotric";

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

function makeClient(fetchFn) {
  return createProtoDBClient({
    url: URL_BASE,
    project: PROJECT,
    storage: memoryStorage(),
    fetch: fetchFn,
  }).auth;
}

test("signUp posts credentials (never secrets) and returns the user", async () => {
  let posted = null;
  const auth = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/signup`]: async (_url, init) => {
        posted = JSON.parse(init.body);
        return Response.json(
          { ok: true, user: { id: "user-1", email: "user@example.com", email_verified: false }, message: "Check your inbox." },
          { status: 201 }
        );
      },
    })
  );
  const result = await auth.signUp({ email: "user@example.com", password: "Secret123", redirectTo: "https://app.example.com/verify-email" });
  assert.equal(result.user.email, "user@example.com");
  assert.match(result.message, /inbox/);
  assert.equal(posted.email, "user@example.com");
  assert.equal(posted.password, "Secret123");
  assert.equal(posted.redirect_to, "https://app.example.com/verify-email");
  assert.ok(!("client_secret" in posted) && !("secret" in posted), "no secret fields");
});

test("signUp surfaces duplicate accounts distinctly", async () => {
  const auth = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/signup`]: async () =>
        Response.json({ ok: false, error: "conflict", message: "An account with this email already exists." }, { status: 409 }),
    })
  );
  await assert.rejects(auth.signUp({ email: "user@example.com", password: "Secret123" }), (e) => {
    assert.ok(e instanceof ProtoDBAuthError);
    assert.match(e.message, /already exists/);
    return true;
  });
});

test("signInWithPassword persists the session and notifies", async () => {
  let posted = null;
  const events = [];
  const auth = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async (_url, init) => {
        posted = JSON.parse(init.body);
        return Response.json(TOKEN_OK);
      },
    })
  );
  auth.onAuthStateChange((event, session) => events.push([event, session?.user.email]));
  const { session, user } = await auth.signInWithPassword({ email: "user@example.com", password: "Secret123" });
  assert.equal(posted.grant_type, "password");
  assert.equal(session.access_token, TOKEN_OK.access_token);
  assert.equal(user.email, "user@example.com");
  assert.deepEqual(events, [["SIGNED_IN", "user@example.com"]]);
  const stored = await auth.getSession();
  assert.equal(stored?.refresh_token, TOKEN_OK.refresh_token);
});

test("signInWithPassword maps unverified email distinctly", async () => {
  const auth = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async () =>
        Response.json({ error: "email_not_verified", error_description: "Please verify your email before signing in." }, { status: 403 }),
    })
  );
  await assert.rejects(auth.signInWithPassword({ email: "u@e.com", password: "x" }), (e) => {
    assert.ok(e instanceof ProtoDBAuthError && e.code === "email_not_verified");
    return true;
  });
  assert.equal(await auth.getSession(), null, "failed login must not persist anything");
});

test("recovery and verification round-trip through the SDK", async () => {
  const calls = [];
  const auth = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/recover`]: async (_url, init) => {
        calls.push(["recover", JSON.parse(init.body)]);
        return Response.json({ ok: true });
      },
      [`POST /api/projects/${PROJECT}/auth/v1/verify`]: async (_url, init) => {
        calls.push(["verify", JSON.parse(init.body)]);
        return Response.json({ ok: true, user: { id: "user-1", email: "user@example.com", email_verified: true } });
      },
      [`POST /api/projects/${PROJECT}/auth/v1/update-password`]: async (_url, init) => {
        calls.push(["update-password", JSON.parse(init.body)]);
        return Response.json({ ok: true });
      },
    })
  );
  await auth.resetPasswordForEmail("user@example.com", { redirectTo: "https://app.example.com/reset-password" });
  const verified = await auth.verifyEmail("tok123");
  assert.equal(verified.user.id, "user-1");
  await auth.updatePassword({ token: "tok456", newPassword: "NewSecret1" });
  assert.equal(await auth.getSession(), null, "recovery completion clears local state");
  assert.deepEqual(
    calls.map(([name]) => name),
    ["recover", "verify", "update-password"]
  );
  assert.equal(calls[0][1].redirect_to, "https://app.example.com/reset-password");
});

test("session-mode password update uses the bearer session", async () => {
  let headers = null;
  let posted = null;
  const auth = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async () => Response.json(TOKEN_OK),
      [`POST /api/projects/${PROJECT}/auth/v1/update-password`]: async (_url, init) => {
        headers = init.headers;
        posted = JSON.parse(init.body);
        return Response.json({ ok: true });
      },
    })
  );
  await auth.signInWithPassword({ email: "user@example.com", password: "Secret123" });
  await auth.updatePassword({ currentPassword: "Secret123", newPassword: "BrandNew1" });
  assert.equal(headers.Authorization, `Bearer ${TOKEN_OK.access_token}`);
  assert.equal(posted.current_password, "Secret123");
  assert.equal(posted.new_password, "BrandNew1");
});

test("deleteAccount blocks on password errors but clears on success", async () => {
  const bad = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async () => Response.json(TOKEN_OK),
      [`DELETE /api/projects/${PROJECT}/auth/v1/user`]: async () =>
        Response.json({ error: "password_invalid", error_description: "Current password is incorrect." }, { status: 403 }),
    })
  );
  await bad.signInWithPassword({ email: "user@example.com", password: "Secret123" });
  await assert.rejects(bad.deleteAccount({ password: "Wrong1" }), (e) => {
    assert.ok(e instanceof ProtoDBAuthError && e.code === "password_invalid");
    return true;
  });
  assert.ok(await bad.getSession(), "blocked delete must keep the session");

  const good = makeClient(
    mockFetch({
      [`POST /api/projects/${PROJECT}/auth/v1/token`]: async () => Response.json(TOKEN_OK),
      [`DELETE /api/projects/${PROJECT}/auth/v1/user`]: async () => Response.json({ ok: true }),
    })
  );
  const events = [];
  good.onAuthStateChange((event) => events.push(event));
  await good.signInWithPassword({ email: "user@example.com", password: "Secret123" });
  await good.deleteAccount({ password: "Secret123" });
  assert.equal(await good.getSession(), null);
  assert.ok(events.includes("SIGNED_OUT"));
});
