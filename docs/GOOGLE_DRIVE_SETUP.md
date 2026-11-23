# Google Drive Digital Vault Setup

NEXORA's Digital Vault connects directly to Google Drive API v3 from the browser using least-privilege file access (`https://www.googleapis.com/auth/drive.file`).

## 1. Scope & Privacy Guarantees

- **Least-Privilege Scope**: `https://www.googleapis.com/auth/drive.file` grants access only to folders and files created or opened through NEXORA (such as the `NEXORA Vault` root folder and its contents), keeping the rest of the user's Drive private.
- **In-Memory Token Policy**: OAuth access tokens are stored strictly in a JavaScript module variable inside `src/lib/googleDrive.ts`. Tokens are **never** written to `localStorage`, `sessionStorage`, or IndexedDB, and are wiped automatically whenever Firebase `onAuthStateChanged` reports sign-out.

## 2. OAuth Client & Consent Configuration

1. In Google Cloud Console -> **APIs & Services** -> **Library**, ensure **Google Drive API** is enabled.
2. In **Google Auth Platform / OAuth Consent Screen**, verify:
   - Scopes include `https://www.googleapis.com/auth/drive.file`.
   - Authorized JavaScript origins for your Web OAuth Client ID (`firebase-applet-config.json` -> `oAuthClientId`) include `http://localhost:3000` and your deployed HTTPS origin.
   - If the consent screen is in **Testing** mode, add test user Google emails under Audience / Test users.

## 3. Capabilities Implemented

- **Folder Browsing & Breadcrumbs**: Automatically initializes or locates `NEXORA Vault` and supports subfolder traversal.
- **Search**: Escaped Drive `name contains` search across NEXORA-accessible files.
- **Chunked Resumable Uploads**: Uses `uploadType=resumable` with 512 KiB chunks, real progress updates, `AbortController` cancellation, and session URI retry/resumption after transient errors.
- **File Actions**: Create folder, rename item, move item across folders, download (or export Google native Docs/Sheets/Slides to PDF), and confirmed permanent deletion (`ConfirmDialog`).
- **Firestore Metadata Catalog**: Syncs `driveFileId`, `driveParentId`, and `driveWebViewLink` references into the user's `vaultFiles` collection when signed into a verified cloud account.
