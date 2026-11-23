export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DRIVE_RESUMABLE_CHUNK_BYTES = 512 * 1024; // Multiple of 256 KiB per Drive resumable spec

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  trashed?: boolean;
}

export class DriveApiError extends Error {
  status: number;
  code: string;
  requiresReauth: boolean;

  constructor(message: string, status: number, code = 'drive_error', requiresReauth = false) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
    this.code = code;
    this.requiresReauth = requiresReauth;
  }
}

export function isDriveFolder(item: Pick<DriveFileItem, 'mimeType'>): boolean {
  return item.mimeType === DRIVE_FOLDER_MIME;
}

export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildDriveListQuery(options: { folderId?: string; searchQuery?: string }): string {
  const clauses: string[] = ['trashed = false'];
  const trimmedSearch = options.searchQuery?.trim() ?? '';

  if (trimmedSearch.length > 0) {
    clauses.push(`name contains '${escapeDriveQueryValue(trimmedSearch)}'`);
  } else if (options.folderId && options.folderId !== 'root') {
    clauses.push(`'${escapeDriveQueryValue(options.folderId)}' in parents`);
  } else {
    clauses.push(`'root' in parents`);
  }

  return clauses.join(' and ');
}

export function buildResumableRangeHeader(start: number, endExclusive: number, totalSize: number): string {
  if (totalSize === 0) {
    return 'bytes */0';
  }
  const safeEnd = Math.max(start, endExclusive - 1);
  return `bytes ${start}-${safeEnd}/${totalSize}`;
}

export function parseRangeHeaderEnd(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = /bytes=\d+-(\d+)/i.exec(rangeHeader);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function mapDriveApiError(
  status: number,
  rawBody?: string | null
): { message: string; code: string; requiresReauth: boolean } {
  let reason = '';
  let apiMessage = '';

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as {
        error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> };
      };
      apiMessage = parsed.error?.message || '';
      reason = parsed.error?.errors?.[0]?.reason || '';
    } catch {
      apiMessage = rawBody.slice(0, 180);
    }
  }

  if (status === 401) {
    return {
      code: 'drive_token_expired',
      requiresReauth: true,
      message: 'Google Drive session expired or was revoked. Reconnect Google Drive to continue.',
    };
  }

  if (status === 403) {
    if (reason === 'storageQuotaExceeded' || apiMessage.toLowerCase().includes('storage quota')) {
      return {
        code: 'drive_quota_exceeded',
        requiresReauth: false,
        message: 'Google Drive storage quota is full. Free space in Drive before uploading.',
      };
    }
    if (reason === 'insufficientFilePermissions' || reason === 'insufficientPermissions') {
      return {
        code: 'drive_insufficient_permissions',
        requiresReauth: true,
        message: 'Missing permission to access that Google Drive item. Reconnect Google Drive and approve file access.',
      };
    }
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      return {
        code: 'drive_rate_limited',
        requiresReauth: false,
        message: 'Google Drive rate limit reached. Wait a moment and retry.',
      };
    }
    return {
      code: 'drive_forbidden',
      requiresReauth: false,
      message: apiMessage || 'Google Drive denied access to this file or folder.',
    };
  }

  if (status === 404) {
    return {
      code: 'drive_not_found',
      requiresReauth: false,
      message: 'The selected Google Drive file or folder no longer exists or is outside NEXORA scope.',
    };
  }

  if (status === 429) {
    return {
      code: 'drive_rate_limited',
      requiresReauth: false,
      message: 'Too many requests to Google Drive. Please pause briefly before retrying.',
    };
  }

  if (status >= 500) {
    return {
      code: 'drive_server_error',
      requiresReauth: false,
      message: 'Google Drive is temporarily unavailable. You can retry the operation.',
    };
  }

  return {
    code: 'drive_request_failed',
    requiresReauth: false,
    message: apiMessage || `Google Drive request failed (HTTP ${status}).`,
  };
}

export function formatDriveFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
