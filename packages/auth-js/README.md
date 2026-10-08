# @protodb/auth-js

First-party browser client for **ProtoDB project Auth** — Supabase-style Google sign-in for external apps. Zero dependencies. No secrets: the Google Client Secret never leaves the ProtoDB server.

## Setup (ProtoDB dashboard)

1. Create a project: **Projects → New project** (slug, e.g. `alvotric`).
2. Open the project → **Authentication** → fill **Google Client ID**, paste **Client Secret** once, add your app's callback URLs under **Allowed Redirect URLs**, enable Google, save.
3. Copy the **ProtoDB callback URL** shown on that page.

## Two URLs (do not confuse them)

**A) Google Cloud → ProtoDB callback.** In Google Cloud Console (APIs & Services → Credentials → your OAuth client), register exactly this under *Authorized redirect URIs*:

```
{PROTODB_ORIGIN}/api/projects/{slug}/auth/v1/callback
```

Google sends the user back here. ProtoDB verifies identity, then forwards a one-time code to your app.

**B) ProtoDB project → your app callback.** Register your app's own page (e.g. `https://app.example.com/auth/callback`) in the project's **Allowed Redirect URLs**. ProtoDB redirects here with `?code=…&state=…`. Exact match is enforced — scheme, host, path, and query must all match.

## Install

```bash
npm install @protodb/auth-js
```

## Use

```ts
import { createProtoDBClient } from "@protodb/auth-js";

const protodb = createProtoDBClient({
  url: "http://localhost:3000",
  project: "alvotric",
});

// 1. Button handler — redirects the browser to ProtoDB (then Google).
await protodb.auth.signInWithGoogle();

// 1b. Or email/password (no Google involved).
await protodb.auth.signUp({ email, password, name, redirectTo: "https://app.example.com/verify-email" });
await protodb.auth.signInWithPassword({ email, password });

// 1c. Password recovery + verification (single-use emailed tokens).
await protodb.auth.resetPasswordForEmail(email, { redirectTo: "https://app.example.com/reset-password" });
await protodb.auth.verifyEmail(token);
await protodb.auth.updatePassword({ token, newPassword }); // recovery mode
await protodb.auth.updatePassword({ currentPassword, newPassword }); // signed-in mode

// 2. On your redirect page — exchanges code + PKCE verifier, stores session.
const { session, user } = await protodb.auth.handleCallback();

// 3. Anywhere else.
const user = await protodb.auth.getUser();
const session = await protodb.auth.getSession(); // auto-refreshes when expiring

// 4. Sign out (revokes server-side, clears local state).
await protodb.auth.signOut();
```

`signInWithGoogle({ redirectTo, state })` defaults the redirect to the current page — register that page first. `handleCallback({ url?, cleanupUrl? })` defaults to the current URL and strips `code`/`state` from the address bar. `onAuthStateChange(cb)` subscribes to `SIGNED_IN | SIGNED_OUT | TOKEN_REFRESHED | USER_UPDATED`. Sessions persist in `localStorage` (in-memory fallback); access tokens auto-refresh 60s before expiry.

## Security model

- Authorization code + PKCE S256 + state verification are mandatory, enforced server-side.
- The Client Secret lives only in the ProtoDB database (encrypted) and is used only during the server-side code exchange.
- Project bearer tokens are opaque, short-lived (1h access, rotating 30d refresh with reuse detection), and are **not** ProtoDB Admin sessions — they cannot access the admin dashboard.
- See `examples/external-auth-example` for a runnable reference app.
