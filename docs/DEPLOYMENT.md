# Deployment & Troubleshooting Guide

## Production Build & Startup

```bash
npm run build
npm start
```

`server.ts` serves both the `/api/*` endpoints and the compiled Vite SPA (`dist/`) on port `3000` (or `process.env.PORT`).

## Deploying Firestore Security Rules

```bash
npx firebase deploy --only firestore:rules
```

Ensure `firebase-applet-config.json` targets your active Firebase project ID before deploying rules.

---

## Troubleshooting

### `auth/operation-not-allowed`
The selected provider (e.g. Facebook, X, or GitHub) has not been enabled in Firebase Console -> Authentication -> Sign-in method. Enable it with its OAuth App credentials and ensure `https://<authDomain>/__/auth/handler` is registered in the provider's developer portal.

### `auth/unauthorized-domain`
The hostname serving NEXORA is not listed in Firebase Console -> Authentication -> Settings -> Authorized domains. Add the domain (without scheme or port).

### `auth/account-exists-with-different-credential`
Your email already belongs to another sign-in provider. Sign in using your existing method when prompted by NEXORA's linking card; NEXORA will automatically attach the new provider via `linkWithCredential`.

### `auth/popup-blocked`
Browser or mobile WebView blocked the popup window. Toggle **Prefer Redirect Sign-In** on the sign-in screen or allow popups for this origin.

### Google Drive `401` or `403 storageQuotaExceeded`
- `401`: In-memory Drive access tokens expire after ~1 hour or on reload. Click **Sign in with Google for Drive** to refresh consent cleanly.
- `403 storageQuotaExceeded`: Target Google Drive account is out of storage space; free storage in Drive and click **Retry** on the resumable upload.

### `401` / `403` on `/api/ai/assist`
- `401`: Request is missing a valid Firebase ID token (Local Offline mode cannot call server AI endpoints).
- `403 EMAIL_VERIFICATION_REQUIRED`: Verify your Firebase account email and click refresh before querying NEXORA AI.
