# External auth reference app (disposable)

Proves `@protodb/auth-js` works against a real ProtoDB server. Real Google sign-in only — no fake authentication anywhere in this directory.

## Run

1. Start ProtoDB locally (`npm run dev`, serves `http://localhost:3000`).
2. Create project `alvotric`, enable Google, add exactly this redirect URL:
   `http://localhost:8080/callback.html`
3. Register the ProtoDB callback in Google Cloud Console:
   `http://localhost:3000/api/projects/alvotric/auth/v1/callback`
4. Serve this directory (any static server, must be port 8080):
   `npx serve -l 8080 .`
5. Open `http://localhost:8080/`, click **Sign in with Google**.

The SDK bundle is imported from `../../packages/auth-js/dist/` (built via `npm run build:auth-js`).
