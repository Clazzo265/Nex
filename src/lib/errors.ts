export interface StructuredUserError {
  title: string;
  whatHappened: string;
  affectedOperation: string;
  dataSafety: string;
  nextAction: string;
}

export function formatFriendlyError(
  error: unknown,
  affectedOperation: string,
  dataSavedLocally = true
): StructuredUserError {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('email_verified') || raw.includes('Missing or insufficient permissions')) {
    return {
      title: 'Action requires verified access',
      whatHappened: 'Your cloud database rejected this write because your email verification or session permission is incomplete.',
      affectedOperation,
      dataSafety: dataSavedLocally
        ? 'Your changes are preserved locally and will not be discarded.'
        : 'Existing records remain untouched.',
      nextAction: 'Verify your email address in Settings or sign in again with Google.',
    };
  }

  if (raw.includes('auth/wrong-password') || raw.includes('auth/invalid-credential')) {
    return {
      title: 'Sign-in credentials did not match',
      whatHappened: 'The email or password entered could not be verified.',
      affectedOperation,
      dataSafety: 'Your account and stored records remain safe.',
      nextAction: 'Double-check your password or use Reset Password.',
    };
  }

  if (raw.includes('auth/operation-not-allowed')) {
    return {
      title: 'Sign-in method not enabled',
      whatHappened: 'Email/Password sign-in is not yet enabled in the Firebase Authentication console for this project.',
      affectedOperation,
      dataSafety: 'No data was lost.',
      nextAction: 'Use Google Sign-In, enable Email/Password in Firebase Console, or use Local Offline Workspace.',
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
      nextAction: 'Continue working offline; NEXORA will retry automatically when connectivity returns.',
    };
  }

  return {
    title: 'Operation could not be completed',
    whatHappened: raw.length > 160 ? `${raw.slice(0, 157)}...` : raw,
    affectedOperation,
    dataSafety: dataSavedLocally
      ? 'Your local state remains intact.'
      : 'Existing records were not altered.',
    nextAction: 'Review the entered values and try again.',
  };
}
