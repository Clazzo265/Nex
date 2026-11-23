import { extractFirebaseErrorCode, mapFirebaseAuthError } from './authUtils';

export interface StructuredUserError {
  title: string;
  whatHappened: string;
  affectedOperation: string;
  dataSafety: string;
  nextAction: string;
  code?: string;
}

export function formatFriendlyError(
  error: unknown,
  affectedOperation: string,
  dataSavedLocally = true
): StructuredUserError {
  const code = extractFirebaseErrorCode(error);
  if (code.startsWith('auth/')) {
    const mapped = mapFirebaseAuthError(error, affectedOperation);
    return {
      code: mapped.code,
      title: mapped.title,
      whatHappened: mapped.message,
      affectedOperation,
      dataSafety: 'Your account and stored records remain untouched.',
      nextAction: mapped.nextAction,
    };
  }

  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('email_verified') || raw.includes('Missing or insufficient permissions')) {
    return {
      title: 'Action requires verified access',
      whatHappened:
        'Your cloud database rejected this write because email verification or session permission is incomplete.',
      affectedOperation,
      dataSafety: dataSavedLocally
        ? 'Your changes are preserved locally and will not be discarded.'
        : 'Existing records remain untouched.',
      nextAction: 'Verify your email address and refresh your session before retrying sync.',
    };
  }

  if (raw.toLowerCase().includes('quota')) {
    return {
      title: 'Device storage limit reached',
      whatHappened: 'Your browser local storage quota is full.',
      affectedOperation,
      dataSafety: 'Existing records remain readable.',
      nextAction: 'Export an archive in Settings and clear old cached files or free device storage.',
    };
  }

  if (raw.includes('offline') || raw.includes('Failed to fetch') || raw.includes('network')) {
    return {
      title: 'Connection interrupted',
      whatHappened: 'The network request could not reach the server.',
      affectedOperation,
      dataSafety: dataSavedLocally
        ? 'Your entry is safely saved in local IndexedDB and queued for synchronization.'
        : 'No stored data was modified.',
      nextAction: 'Continue working offline; NEXORA will retry automatically with backoff.',
    };
  }

  return {
    title: 'Operation could not be completed',
    whatHappened: raw.length > 160 ? `${raw.slice(0, 157)}...` : raw,
    affectedOperation,
    dataSafety: dataSavedLocally ? 'Your local state remains intact.' : 'Existing records were not altered.',
    nextAction: 'Review the entered values and try again.',
  };
}
