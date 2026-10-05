# External auth reference app (disposable)

Proves `@protodb/auth-js` works against a real ProtoDB server. Real Google sign-in only — no fake authentication anywhere in this directory.

## Run

1. Start ProtoDB locally (`npm run dev`, serves `http://localhost:3000`).
2. Build the SDK and sync the vendored copy (the canonical source stays in `packages/auth-js`):
   `npm run build:auth-js && npm run sync:auth-example`
3. Create project `alvotric`, enable Google, add exactly this redirect URL:
   `http://localhost:8080/callback.html`
4. Register the ProtoDB callback in Google Cloud Console:
   `http://localhost:3000/api/projects/alvotric/auth/v1/callback`
5. Serve this directory directly (run from inside it, must be port 8080):
   `cd examples/external-auth-example && npx serve -l 8080 .`
6. Open `http://localhost:8080/`, click **Sign in with Google**.

The browser loads the SDK from `./vendor/auth-js/index.js`, a generated copy of `packages/auth-js/dist/`.
