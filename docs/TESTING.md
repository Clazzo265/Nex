# Testing & Quality Verification Guide

## Automated Test Commands

```bash
# TypeScript static typecheck
npm run typecheck

# Unit & Express server security integration tests (21+ tests)
npm test

# Static Firestore security rules checks (+ live emulator tests if running)
npm run test:rules

# Official Firebase Security Rules ESLint validation
npm run rules:lint

# Production Vite build
npm run build
```

## Running Live Firestore Emulator Security Tests

`firestore.rules.test.ts` uses `@firebase/rules-unit-testing` to verify:
- Global default deny for unauthenticated users
- Email verification denial (`email_verified: false` cannot write domain docs)
- Cross-user isolation (`bob` cannot read or update `alice` records)
- `serverTimestamp()` forgery rejection
- Negative transaction amounts rejection
- Allowed `transfer` transactions
- Append-only immutability of `auditLogs`

**Prerequisite**: Java 17+ and Firebase CLI (`firebase-tools`). Run:

```bash
npx firebase emulators:exec --only firestore "npm run test:rules"
```

When Java / Firestore Emulator is not present in the container, `test:rules` still runs static rule assertions and explicitly marks the live emulator subtest as `SKIP` (never a false pass).

## Manual QA Matrix

- **Auth & Verification**: Register new email/password account -> verify weak password guidance -> confirm verification pending screen blocks dashboard access -> verify email -> click refresh status -> dashboard mounts.
- **Provider Linking & Errors**: Attempt duplicate email signup (`auth/email-already-in-use` preserves email & offers Sign In/Reset), sign in with different social provider for existing email (`auth/account-exists-with-different-credential` preserves pending credential and links on sign-in), unlink secondary provider in Settings (blocked if last provider).
- **Finance Transfers**: Record a `transfer` transaction -> confirm income, expenses, and budgets remain unchanged while `Internal Transfers` and reconciliation summary remain balanced; test duplicate transaction prompt.
- **Digital Vault**: Connect Google Drive, browse `NEXORA Vault`, create folder, upload file with progress/cancel/retry, rename, move, download, and confirm deletion.
- **Mobile (`390x844`)**: Verify drawer navigation, >= 44px touch targets, and zero horizontal page overflow.
