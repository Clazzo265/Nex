import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { auth, driveGoogleProvider, firebaseConfig, GOOGLE_DRIVE_SCOPES } from './firebase';
import {
  buildDriveListQuery,
  buildResumableRangeHeader,
  DRIVE_FOLDER_MIME,
  DRIVE_RESUMABLE_CHUNK_BYTES,
  DriveApiError,
  mapDriveApiError,
  parseRangeHeaderEnd,
  type DriveFileItem,
} from './driveUtils';

export { DriveApiError };

export interface DriveSessionInfo {
  connected: boolean;
  accountEmail: string | null;
  expiresAtMs: number | null;
}

// Strict in-memory token store only (never localStorage or sessionStorage).
let cachedDriveToken: {
  accessToken: string;
  expiresAtMs: number;
  accountEmail: string | null;
} | null = null;

// Clear cached in-memory Drive token automatically whenever Firebase user signs out.
onAuthStateChanged(auth, (firebaseUser) => {
  if (!firebaseUser) {
    cachedDriveToken = null;
  }
});

export function getDriveSessionInfo(): DriveSessionInfo {
  if (!cachedDriveToken || Date.now() >= cachedDriveToken.expiresAtMs) {
    if (cachedDriveToken && Date.now() >= cachedDriveToken.expiresAtMs) {
      cachedDriveToken = null;
    }
    return {
      connected: false,
      accountEmail: null,
      expiresAtMs: null,
    };
  }
  return {
    connected: true,
    accountEmail: cachedDriveToken.accountEmail,
    expiresAtMs: cachedDriveToken.expiresAtMs,
  };
}

export function getDriveAccessToken(): string | null {
  if (!cachedDriveToken) return null;
  if (Date.now() >= cachedDriveToken.expiresAtMs) {
    cachedDriveToken = null;
    return null;
  }
  return cachedDriveToken.accessToken;
}

export function clearDriveAccessToken(): void {
  cachedDriveToken = null;
}

function cacheToken(accessToken: string, email: string | null, expiresInSeconds = 3300): void {
  cachedDriveToken = {
    accessToken,
    accountEmail: email,
    expiresAtMs: Date.now() + Math.max(60, expiresInSeconds - 120) * 1000,
  };
}

async function requestDriveTokenViaGis(emailHint?: string | null): Promise<{
  accessToken: string;
  email: string | null;
}> {
  if (typeof window === 'undefined' || !firebaseConfig.oAuthClientId) {
    throw new DriveApiError('Google Drive client ID is not configured.', 400, 'missing_client_id');
  }

  await new Promise<void>((resolve, reject) => {
    const existing = (window as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google;
    if (existing?.accounts?.oauth2) {
      resolve();
      return;
    }
    const scriptId = 'nexora-gis-client-script';
    if (document.getElementById(scriptId)) {
      const checkTimer = window.setInterval(() => {
        const loaded = (window as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google;
        if (loaded?.accounts?.oauth2) {
          window.clearInterval(checkTimer);
          resolve();
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(checkTimer);
        reject(new DriveApiError('Timed out loading Google Identity Services.', 504, 'gis_timeout'));
      }, 10000);
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new DriveApiError('Could not load Google Sign-In script. Check your internet connection.', 503, 'gis_load_failed'));
    document.head.appendChild(script);
  });

  return new Promise((resolve, reject) => {
    const googleApi = (window as unknown as {
      google?: {
        accounts?: {
          oauth2?: {
            initTokenClient: (config: {
              client_id: string;
              scope: string;
              hint?: string;
              callback: (response: {
                access_token?: string;
                expires_in?: number;
                error?: string;
                error_description?: string;
              }) => void;
              error_callback?: (err: { type?: string; message?: string }) => void;
            }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
          };
        };
      };
    }).google;

    const oauth2 = googleApi?.accounts?.oauth2;
    if (!oauth2) {
      reject(new DriveApiError('Google Sign-In client unavailable.', 503, 'gis_unavailable'));
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: firebaseConfig.oAuthClientId,
      scope: GOOGLE_DRIVE_SCOPES.join(' '),
      hint: emailHint ?? undefined,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new DriveApiError(
              response.error_description || 'Google Drive access was cancelled or denied.',
              401,
              response.error || 'gis_denied',
              true
            )
          );
          return;
        }
        cacheToken(response.access_token, emailHint ?? null, response.expires_in ?? 3500);
        resolve({ accessToken: response.access_token, email: emailHint ?? null });
      },
      error_callback: (err) => {
        reject(
          new DriveApiError(
            err.message || 'Popup was closed or blocked while connecting Google Drive.',
            401,
            err.type || 'gis_popup_error',
            true
          )
        );
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export async function connectGoogleDriveSession(currentUser: User | null): Promise<{
  accessToken: string;
  email: string | null;
}> {
  if (currentUser) {
    const hasGoogleLinked = currentUser.providerData.some((p) => p.providerId === 'google.com');
    try {
      const credResult = hasGoogleLinked
        ? await reauthenticateWithPopup(currentUser, driveGoogleProvider)
        : await linkWithPopup(currentUser, driveGoogleProvider);

      const oauthCred = GoogleAuthProvider.credentialFromResult(credResult);
      if (oauthCred?.accessToken) {
        const email = credResult.user.email ?? currentUser.email ?? null;
        cacheToken(oauthCred.accessToken, email);
        return { accessToken: oauthCred.accessToken, email };
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw new DriveApiError('Google Drive authorization was cancelled before completion.', 401, code, true);
      }
      if (code === 'auth/popup-blocked') {
        throw new DriveApiError(
          'Browser blocked the Google Drive sign-in popup. Allow popups for this site and retry.',
          400,
          code,
          true
        );
      }
      // If linking another Google account conflicts with Firebase UID, or Firebase Auth omits token,
      // fall back cleanly to Google Identity Services Drive-only consent without changing Firebase UID.
      if (
        code !== 'auth/credential-already-in-use' &&
        code !== 'auth/provider-already-linked' &&
        code !== 'auth/email-already-in-use'
      ) {
        throw new DriveApiError(
          err instanceof Error ? err.message : 'Unable to connect Google Drive.',
          401,
          code || 'drive_auth_error',
          true
        );
      }
    }
    return requestDriveTokenViaGis(currentUser.email);
  }

  // Fallback if invoked before Firebase user context (e.g., direct popup sign-in)
  try {
    const result = await signInWithPopup(auth, driveGoogleProvider);
    const oauthCred = GoogleAuthProvider.credentialFromResult(result);
    if (oauthCred?.accessToken) {
      const email = result.user.email ?? null;
      cacheToken(oauthCred.accessToken, email);
      return { accessToken: oauthCred.accessToken, email };
    }
  } catch {
    // Fallback to GIS token request
  }

  return requestDriveTokenViaGis(null);
}

async function driveFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const mapped = mapDriveApiError(res.status, text);
    if (mapped.requiresReauth) {
      clearDriveAccessToken();
    }
    throw new DriveApiError(mapped.message, res.status, mapped.code, mapped.requiresReauth);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function normalizeDriveFile(raw: {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  trashed?: boolean;
}): DriveFileItem {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    sizeBytes: raw.size ? Number.parseInt(raw.size, 10) || 0 : 0,
    modifiedTime: raw.modifiedTime,
    parents: raw.parents,
    webViewLink: raw.webViewLink,
    trashed: raw.trashed,
  };
}

export async function listDriveFiles(params: {
  accessToken: string;
  folderId?: string;
  searchQuery?: string;
  pageToken?: string;
}): Promise<{ files: DriveFileItem[]; nextPageToken?: string }> {
  const q = buildDriveListQuery({
    folderId: params.folderId,
    searchQuery: params.searchQuery,
  });

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('orderBy', 'folder,modifiedTime desc');
  url.searchParams.set('pageSize', '50');
  url.searchParams.set(
    'fields',
    'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink,trashed)'
  );
  if (params.pageToken) {
    url.searchParams.set('pageToken', params.pageToken);
  }

  const data = await driveFetch<{
    nextPageToken?: string;
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      modifiedTime?: string;
      parents?: string[];
      webViewLink?: string;
      trashed?: boolean;
    }>;
  }>(url.toString(), params.accessToken);

  return {
    files: (data.files ?? []).map(normalizeDriveFile),
    nextPageToken: data.nextPageToken,
  };
}

export async function ensureNexoraRootFolder(accessToken: string): Promise<DriveFileItem> {
  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
  searchUrl.searchParams.set(
    'q',
    `name = 'NEXORA Vault' and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`
  );
  searchUrl.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,parents,webViewLink)');

  const existing = await driveFetch<{
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      modifiedTime?: string;
      parents?: string[];
      webViewLink?: string;
    }>;
  }>(searchUrl.toString(), accessToken);

  if (existing.files && existing.files.length > 0) {
    return normalizeDriveFile(existing.files[0]);
  }

  return createDriveFolder({
    accessToken,
    name: 'NEXORA Vault',
  });
}

export async function createDriveFolder(params: {
  accessToken: string;
  name: string;
  parentId?: string;
}): Promise<DriveFileItem> {
  const body: Record<string, unknown> = {
    name: params.name.trim(),
    mimeType: DRIVE_FOLDER_MIME,
  };
  if (params.parentId && params.parentId !== 'root') {
    body.parents = [params.parentId];
  }

  const created = await driveFetch<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    parents?: string[];
    webViewLink?: string;
  }>(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,size,modifiedTime,parents,webViewLink',
    params.accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return normalizeDriveFile(created);
}

export async function renameDriveFile(params: {
  accessToken: string;
  fileId: string;
  newName: string;
}): Promise<DriveFileItem> {
  const updated = await driveFetch<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    parents?: string[];
    webViewLink?: string;
  }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}?fields=id,name,mimeType,size,modifiedTime,parents,webViewLink`,
    params.accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: params.newName.trim() }),
    }
  );
  return normalizeDriveFile(updated);
}

export async function moveDriveFile(params: {
  accessToken: string;
  fileId: string;
  currentParents?: string[];
  targetParentId: string;
}): Promise<DriveFileItem> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}`
  );
  url.searchParams.set('addParents', params.targetParentId);
  if (params.currentParents && params.currentParents.length > 0) {
    url.searchParams.set('removeParents', params.currentParents.join(','));
  }
  url.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime,parents,webViewLink');

  const moved = await driveFetch<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    parents?: string[];
    webViewLink?: string;
  }>(url.toString(), params.accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return normalizeDriveFile(moved);
}

export async function deleteDriveFile(params: {
  accessToken: string;
  fileId: string;
}): Promise<void> {
  await driveFetch<void>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}`,
    params.accessToken,
    {
      method: 'DELETE',
    }
  );
}

export async function downloadDriveFile(params: {
  accessToken: string;
  file: DriveFileItem;
}): Promise<void> {
  const isGoogleNative = params.file.mimeType.startsWith('application/vnd.google-apps.');
  const endpoint = isGoogleNative
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.file.id)}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.file.id)}?alt=media`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const mapped = mapDriveApiError(res.status, text);
    if (mapped.requiresReauth) clearDriveAccessToken();
    throw new DriveApiError(mapped.message, res.status, mapped.code, mapped.requiresReauth);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = isGoogleNative ? `${params.file.name}.pdf` : params.file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export interface ResumableUploadResult {
  file: DriveFileItem;
  sessionUri: string;
}

export class ResumableUploadError extends DriveApiError {
  sessionUri?: string;
  uploadedBytes: number;

  constructor(
    message: string,
    status: number,
    code: string,
    requiresReauth: boolean,
    uploadedBytes: number,
    sessionUri?: string
  ) {
    super(message, status, code, requiresReauth);
    this.name = 'ResumableUploadError';
    this.uploadedBytes = uploadedBytes;
    this.sessionUri = sessionUri;
  }
}

export async function uploadFileResumable(params: {
  accessToken: string;
  file: File;
  parentId?: string;
  existingSessionUri?: string;
  signal?: AbortSignal;
  onProgress?: (uploadedBytes: number, totalBytes: number, sessionUri: string) => void;
}): Promise<ResumableUploadResult> {
  const { accessToken, file, parentId, signal, onProgress } = params;
  const totalBytes = file.size;
  const mimeType = file.type || 'application/octet-stream';

  let sessionUri = params.existingSessionUri ?? '';
  let offset = 0;

  if (!sessionUri) {
    const metadata: Record<string, unknown> = {
      name: file.name,
      mimeType,
    };
    if (parentId && parentId !== 'root') {
      metadata.parents = [parentId];
    }

    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,parents,webViewLink',
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(totalBytes),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const text = await initRes.text().catch(() => '');
      const mapped = mapDriveApiError(initRes.status, text);
      if (mapped.requiresReauth) clearDriveAccessToken();
      throw new ResumableUploadError(mapped.message, initRes.status, mapped.code, mapped.requiresReauth, 0);
    }

    const location = initRes.headers.get('Location');
    if (!location) {
      throw new ResumableUploadError(
        'Google Drive did not return a resumable upload session URI.',
        500,
        'missing_session_uri',
        false,
        0
      );
    }
    sessionUri = location;
  } else if (totalBytes > 0) {
    // Query committed byte range before resuming an interrupted session
    try {
      const probeRes = await fetch(sessionUri, {
        method: 'PUT',
        signal,
        headers: {
          'Content-Range': `bytes */${totalBytes}`,
        },
      });
      if (probeRes.status === 200 || probeRes.status === 201) {
        const done = (await probeRes.json()) as Parameters<typeof normalizeDriveFile>[0];
        onProgress?.(totalBytes, totalBytes, sessionUri);
        return { file: normalizeDriveFile(done), sessionUri };
      }
      if (probeRes.status === 308) {
        const end = parseRangeHeaderEnd(probeRes.headers.get('Range'));
        if (end !== null) {
          offset = end + 1;
        }
      }
    } catch {
      // Restart from existing offset 0 if session query could not resolve
      offset = 0;
    }
  }

  // Handle zero-byte file in a single PUT
  if (totalBytes === 0) {
    const emptyRes = await fetch(sessionUri, {
      method: 'PUT',
      signal,
      headers: {
        'Content-Type': mimeType,
      },
      body: new Blob([], { type: mimeType }),
    });
    if (!emptyRes.ok) {
      const text = await emptyRes.text().catch(() => '');
      const mapped = mapDriveApiError(emptyRes.status, text);
      throw new ResumableUploadError(mapped.message, emptyRes.status, mapped.code, mapped.requiresReauth, 0, sessionUri);
    }
    const done = (await emptyRes.json()) as Parameters<typeof normalizeDriveFile>[0];
    onProgress?.(0, 0, sessionUri);
    return { file: normalizeDriveFile(done), sessionUri };
  }

  while (offset < totalBytes) {
    if (signal?.aborted) {
      throw new ResumableUploadError(
        'Upload cancelled by user.',
        499,
        'upload_cancelled',
        false,
        offset,
        sessionUri
      );
    }

    const nextEnd = Math.min(totalBytes, offset + DRIVE_RESUMABLE_CHUNK_BYTES);
    const chunk = file.slice(offset, nextEnd);

    let chunkRes: Response;
    try {
      chunkRes = await fetch(sessionUri, {
        method: 'PUT',
        signal,
        headers: {
          'Content-Type': mimeType,
          'Content-Range': buildResumableRangeHeader(offset, nextEnd, totalBytes),
        },
        body: chunk,
      });
    } catch (err) {
      if (signal?.aborted) {
        throw new ResumableUploadError(
          'Upload cancelled by user.',
          499,
          'upload_cancelled',
          false,
          offset,
          sessionUri
        );
      }
      throw new ResumableUploadError(
        err instanceof Error ? err.message : 'Network error during chunk upload.',
        0,
        'network_error',
        false,
        offset,
        sessionUri
      );
    }

    if (chunkRes.status === 308) {
      const rangeEnd = parseRangeHeaderEnd(chunkRes.headers.get('Range'));
      offset = rangeEnd !== null ? rangeEnd + 1 : nextEnd;
      onProgress?.(offset, totalBytes, sessionUri);
      continue;
    }

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const uploaded = (await chunkRes.json()) as Parameters<typeof normalizeDriveFile>[0];
      onProgress?.(totalBytes, totalBytes, sessionUri);
      return { file: normalizeDriveFile(uploaded), sessionUri };
    }

    const errBody = await chunkRes.text().catch(() => '');
    const mapped = mapDriveApiError(chunkRes.status, errBody);
    if (mapped.requiresReauth) clearDriveAccessToken();
    throw new ResumableUploadError(
      mapped.message,
      chunkRes.status,
      mapped.code,
      mapped.requiresReauth,
      offset,
      sessionUri
    );
  }

  throw new ResumableUploadError(
    'Resumable upload ended without completion confirmation.',
    500,
    'incomplete_upload',
    false,
    offset,
    sessionUri
  );
}
