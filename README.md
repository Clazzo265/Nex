# NEXORA — Your Life. Connected.

NEXORA is an intelligent, offline-first personal operating system built with React 19, TypeScript, Tailwind CSS, Express, Firebase Authentication & Cloud Firestore, Google Drive API v3, and Gemini AI.

## Core Capabilities

- **Multi-Provider Cloud Authentication & Email Verification Gate**: Email & Password, Google, Facebook, X (Twitter), and GitHub via Firebase Authentication, with explicit registration state tracking, email verification enforcement before domain access, automatic redirect support on mobile/embedded WebViews, account collision preservation & linking (`linkWithCredential`), connected provider management (`linkWithPopup` / `unlink` guarding the last remaining sign-in method), and recent-login reauthentication.
- **Isolated Local Offline Workspaces**: Explicitly separated device-only workspaces (`local_ws_*`) with optional Web Crypto SHA-256 PIN lock, completely isolated from Firebase cloud user paths.
- **Offline-First Persistence & Conflict Resolution**: IndexedDB (`DB_VERSION = 2`) with explicit `tx.oncomplete` transaction durability guarantees, browser storage quota monitoring, exponential backoff with symmetric jitter retry queue, and remote `updatedAt`/`version` conflict detection surfaced in an interactive comparison modal.
- **Digital Vault with Google Drive (`drive.file`)**: In-memory OAuth access token management (never persisted to browser storage, auto-cleared on sign-out), folder navigation with breadcrumbs, search, create folder, chunked resumable upload with live progress, cancel (`AbortController`), and retry/resume, rename, move, download, and confirmed deletion.
- **Personal Finance Ledger Integrity**: Exact integer minor-unit currency arithmetic (MWK, USD, EUR, GBP, ZAR, KES), explicit separation of actual vs. estimated records, `transfer` transaction support excluded from income/expense/budget totals while reconciled deterministically, duplicate transaction detection confirmation, and CSV export.
- **Server-Side Verified AI Assistant**: Express `/api/ai/assist` endpoint requiring a verified Firebase ID token (`email_verified === true`), Zod payload & explicit workspace-context consent validation, sliding-window per-user & global rate limiting, usage tracking, and a 25-second timeout budget.
- **Guarded Firebase App Check & Tested Security Rules**: Guarded reCAPTCHA v3 initialization when configured (`VITE_RECAPTCHA_SITE_KEY` / `recaptchaSiteKey`) and strict owner-verified Firestore Security Rules covering all subcollections and append-only audit logs.

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run rules:lint
npm run dev
```

Open `http://localhost:3000`.

## Environment Configuration

Copy `.env.example` to `.env` for local or server deployments and configure only the keys you need:

- `GEMINI_API_KEY`: Server-side key for `/api/ai/assist` (never exposed to browser bundles).
- `APP_URL`: Public URL of your deployment.
- `FIREBASE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS`: Optional server overrides when running outside GCP/ADC or `firebase-applet-config.json`.
- `VITE_RECAPTCHA_SITE_KEY`: Optional Google reCAPTCHA v3 public site key to activate Firebase App Check.

See the guides under `docs/` for complete setup instructions:

- [Firebase Multi-Provider Auth & App Check Setup](docs/FIREBASE_AUTH_SETUP.md)
- [Google Drive Digital Vault Setup](docs/GOOGLE_DRIVE_SETUP.md)
- [Security Architecture](docs/SECURITY.md)
- [Offline Sync & Local Workspaces](docs/OFFLINE_SYNC.md)
- [Testing Guide](docs/TESTING.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
