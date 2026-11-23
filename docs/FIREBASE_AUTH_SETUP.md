# Firebase Authentication & App Check Setup

NEXORA supports five cloud authentication providers through Firebase Authentication:

1. **Email & Password** (with mandatory email verification before domain Firestore & AI access)
2. **Google**
3. **Facebook**
4. **X (formerly Twitter)**
5. **GitHub**

## 1. Authorized Domains

In Firebase Console -> **Authentication** -> **Settings** -> **Authorized domains**, add:
- `localhost` (development)
- Your Cloud Run / production domain (for example, `*.run.app` or your custom domain)

If a domain is missing, NEXORA catches `auth/unauthorized-domain` and surfaces recovery steps rather than failing silently.

## 2. Provider Configuration in Firebase Console

Enable each provider under **Authentication -> Sign-in method**:

- **Email/Password**: Enable **Email/Password** (leave Passwordless optional). Customize the Verification email template action URL if using a custom domain.
- **Google**: Enable and verify support email matches your OAuth consent brand.
- **Facebook**: Create an app in Meta for Developers, enable Facebook Login, copy **App ID** and **App Secret** into Firebase, and register Firebase's OAuth redirect URI (`https://<authDomain>/__/auth/handler`).
- **X (Twitter)**: Create a project in the X Developer Portal with OAuth 1.0a/2.0 user authentication enabled, copy **API Key** and **API Secret**, and add `https://<authDomain>/__/auth/handler` as callback URL.
- **GitHub**: Register a GitHub OAuth App under Settings -> Developer settings -> OAuth Apps with Authorization callback URL `https://<authDomain>/__/auth/handler`, and paste **Client ID** and **Client Secret** into Firebase.

> **Important**: If a provider is not yet enabled in Firebase Console, NEXORA catches `auth/operation-not-allowed` cleanly and instructs the user to pick an active provider or configure Firebase Console. Never enable multiple accounts per email unless you want to skip Firebase account collision protection; NEXORA defaults to **One account per email address** and handles `auth/account-exists-with-different-credential` via guided `linkWithCredential`.

## 3. Connected Accounts & Reauthentication

Once signed in with a verified email, open **Settings -> Security -> Connected Accounts** to:
- View linked sign-in providers
- Link additional providers (`linkWithPopup`)
- Unlink a secondary provider (blocked automatically if it is the last sign-in method)
- Refresh recent login (`reauthenticateWithPopup` / `reauthenticateWithPassword`) before sensitive changes

## 4. Firebase App Check (Guarded Activation)

NEXORA includes guarded Firebase App Check initialization in `src/lib/firebase.ts`:
- When `VITE_RECAPTCHA_SITE_KEY` (or `firebase-applet-config.json` `recaptchaSiteKey`) is present, `ReCaptchaV3Provider` is initialized with auto-refresh.
- When unconfigured, App Check stays gracefully inactive (`disabled_missing_site_key`) and does **not** block development logins.
- Never enforce App Check in Firebase Console until every active client domain has a valid reCAPTCHA v3 key deployed.
