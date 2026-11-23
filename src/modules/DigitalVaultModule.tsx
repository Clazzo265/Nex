import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderLock,
  FolderPlus,
  FolderTree,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { formatDriveFileSize, isDriveFolder, type DriveFileItem } from '../lib/driveUtils';
import {
  clearDriveAccessToken,
  connectGoogleDriveSession,
  createDriveFolder,
  deleteDriveFile,
  downloadDriveFile,
  DriveApiError,
  ensureNexoraRootFolder,
  getDriveAccessToken,
  getDriveSessionInfo,
  listDriveFiles,
  moveDriveFile,
  renameDriveFile,
  ResumableUploadError,
  uploadFileResumable,
} from '../lib/googleDrive';
import type { VaultFileRef } from '../types/nexora';

interface FolderCrumb {
  id: string;
  name: string;
}

interface UploadQueueItem {
  id: string;
  file: File;
  parentId: string;
  uploadedBytes: number;
  totalBytes: number;
  status: 'uploading' | 'completed' | 'cancelled' | 'error';
  error?: string;
  sessionUri?: string;
  controller: AbortController;
}

export const DigitalVaultModule: React.FC = () => {
  const { authMode, user, emailVerified } = useAuth();
  const { vaultFiles, saveRecord, deleteRecord } = useWorkspace();

  const [sessionInfo, setSessionInfo] = useState(() => getDriveSessionInfo());
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);

  const [breadcrumbs, setBreadcrumbs] = useState<FolderCrumb[]>([]);
  const [driveItems, setDriveItems] = useState<DriveFileItem[]>([]);
  const [allDriveFolders, setAllDriveFolders] = useState<DriveFileItem[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<DriveFileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<DriveFileItem | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState('');
  const [driveDeleteTarget, setDriveDeleteTarget] = useState<DriveFileItem | null>(null);

  const [uploads, setUploads] = useState<UploadQueueItem[]>([]);

  // Local Metadata Catalog State
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VaultFileRef | null>(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] ?? null;

  const refreshDriveDirectory = useCallback(
    async (folderId?: string, queryText?: string) => {
      const token = getDriveAccessToken();
      if (!token) {
        setSessionInfo(getDriveSessionInfo());
        return;
      }

      setLoadingDrive(true);
      setDriveError(null);
      try {
        const result = await listDriveFiles({
          accessToken: token,
          folderId: queryText?.trim() ? undefined : folderId,
          searchQuery: queryText,
        });
        setDriveItems(result.files);
        const foldersInList = result.files.filter((item) => isDriveFolder(item));
        if (foldersInList.length > 0) {
          setAllDriveFolders((prev) => {
            const byId = new Map(prev.map((f) => [f.id, f]));
            for (const f of foldersInList) byId.set(f.id, f);
            return Array.from(byId.values());
          });
        }
      } catch (err) {
        if (err instanceof DriveApiError && err.requiresReauth) {
          setSessionInfo(getDriveSessionInfo());
        }
        setDriveError(err instanceof Error ? err.message : 'Unable to load Google Drive files.');
      } finally {
        setLoadingDrive(false);
      }
    },
    []
  );

  useEffect(() => {
    setSessionInfo(getDriveSessionInfo());
  }, [authMode, user]);

  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    setDriveError(null);
    setDriveNotice(null);
    try {
      const { accessToken } = await connectGoogleDriveSession(authMode === 'cloud' ? user : null);
      setSessionInfo(getDriveSessionInfo());

      const rootFolder = await ensureNexoraRootFolder(accessToken);
      const initialCrumbs: FolderCrumb[] = [{ id: rootFolder.id, name: rootFolder.name }];
      setBreadcrumbs(initialCrumbs);
      setAllDriveFolders([rootFolder]);
      await refreshDriveDirectory(rootFolder.id);
      setDriveNotice('Connected to Google Drive in memory for this session.');
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Google Drive connection failed.');
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = () => {
    clearDriveAccessToken();
    setSessionInfo(getDriveSessionInfo());
    setDriveItems([]);
    setBreadcrumbs([]);
    setDriveError(null);
    setDriveNotice('Google Drive session disconnected and cleared from memory.');
  };

  const syncDriveMetadataRecord = async (driveItem: DriveFileItem, parentId?: string) => {
    await saveRecord<VaultFileRef>(
      'vaultFiles',
      {
        name: driveItem.name.slice(0, 240),
        mimeType: driveItem.mimeType || 'application/octet-stream',
        sizeBytes: driveItem.sizeBytes,
        category: 'Personal Document',
        storageProvider: 'google_drive',
        driveFileId: driveItem.id,
        driveParentId: parentId ?? driveItem.parents?.[0],
        driveWebViewLink: driveItem.webViewLink,
        uploadStatus: 'synced',
      },
      false
    );
  };

  const runUploadItem = async (item: UploadQueueItem) => {
    const token = getDriveAccessToken();
    if (!token) {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id
            ? {
                ...u,
                status: 'error',
                error: 'Google Drive session expired. Reconnect Drive and click Retry.',
              }
            : u
        )
      );
      setSessionInfo(getDriveSessionInfo());
      return;
    }

    try {
      const result = await uploadFileResumable({
        accessToken: token,
        file: item.file,
        parentId: item.parentId,
        existingSessionUri: item.sessionUri,
        signal: item.controller.signal,
        onProgress: (uploadedBytes, totalBytes, sessionUri) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id ? { ...u, uploadedBytes, totalBytes, sessionUri } : u
            )
          );
        },
      });

      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id
            ? {
                ...u,
                status: 'completed',
                uploadedBytes: item.file.size,
                totalBytes: item.file.size,
                sessionUri: result.sessionUri,
              }
            : u
        )
      );

      await syncDriveMetadataRecord(result.file, item.parentId);
      await refreshDriveDirectory(currentFolder?.id, driveSearch);
      setDriveNotice(`Uploaded "${result.file.name}" to Google Drive and synced metadata.`);
    } catch (err) {
      const isCancel = err instanceof ResumableUploadError && err.code === 'upload_cancelled';
      const nextSessionUri = err instanceof ResumableUploadError ? err.sessionUri : item.sessionUri;
      const nextBytes = err instanceof ResumableUploadError ? err.uploadedBytes : item.uploadedBytes;
      if (err instanceof DriveApiError && err.requiresReauth) {
        setSessionInfo(getDriveSessionInfo());
      }
      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id
            ? {
                ...u,
                status: isCancel ? 'cancelled' : 'error',
                uploadedBytes: nextBytes,
                sessionUri: nextSessionUri,
                error: isCancel
                  ? 'Upload cancelled.'
                  : err instanceof Error
                    ? err.message
                    : 'Upload failed.',
              }
            : u
        )
      );
    }
  };

  const handleDriveUploadSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    const targetParentId = currentFolder?.id ?? 'root';
    const newItems: UploadQueueItem[] = selectedFiles.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      parentId: targetParentId,
      uploadedBytes: 0,
      totalBytes: file.size,
      status: 'uploading',
      controller: new AbortController(),
    }));

    setUploads((prev) => [...newItems, ...prev]);
    for (const item of newItems) {
      void runUploadItem(item);
    }
  };

  const handleCancelUpload = (uploadId: string) => {
    setUploads((prev) =>
      prev.map((u) => {
        if (u.id === uploadId) {
          u.controller.abort();
        }
        return u;
      })
    );
  };

  const handleRetryUpload = (item: UploadQueueItem) => {
    const updated: UploadQueueItem = {
      ...item,
      status: 'uploading',
      error: undefined,
      controller: new AbortController(),
    };
    setUploads((prev) => prev.map((u) => (u.id === item.id ? updated : u)));
    void runUploadItem(updated);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getDriveAccessToken();
    const trimmed = newFolderName.trim();
    if (!token || !trimmed) return;
    setCreatingFolder(true);
    setDriveError(null);
    try {
      const created = await createDriveFolder({
        accessToken: token,
        name: trimmed,
        parentId: currentFolder?.id,
      });
      setNewFolderName('');
      setAllDriveFolders((prev) => [...prev, created]);
      await refreshDriveDirectory(currentFolder?.id, driveSearch);
      setDriveNotice(`Created folder "${created.name}" in Google Drive.`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Unable to create folder.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getDriveAccessToken();
    if (!token || !renameTarget || !renameValue.trim()) return;
    setDriveError(null);
    try {
      const updated = await renameDriveFile({
        accessToken: token,
        fileId: renameTarget.id,
        newName: renameValue.trim(),
      });
      setRenameTarget(null);
      setRenameValue('');
      await refreshDriveDirectory(currentFolder?.id, driveSearch);
      setDriveNotice(`Renamed item to "${updated.name}".`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Failed to rename item.');
    }
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getDriveAccessToken();
    if (!token || !moveTarget || !moveDestinationId) return;
    setDriveError(null);
    try {
      await moveDriveFile({
        accessToken: token,
        fileId: moveTarget.id,
        currentParents: moveTarget.parents,
        targetParentId: moveDestinationId,
      });
      const movedName = moveTarget.name;
      setMoveTarget(null);
      setMoveDestinationId('');
      await refreshDriveDirectory(currentFolder?.id, driveSearch);
      setDriveNotice(`Moved "${movedName}" to selected folder.`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Failed to move item.');
    }
  };

  const handleOpenFolder = async (folder: DriveFileItem) => {
    setDriveSearch('');
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    await refreshDriveDirectory(folder.id);
  };

  const handleCrumbClick = async (index: number) => {
    const nextCrumbs = breadcrumbs.slice(0, index + 1);
    const target = nextCrumbs[nextCrumbs.length - 1];
    setBreadcrumbs(nextCrumbs);
    setDriveSearch('');
    await refreshDriveDirectory(target?.id);
  };

  const handleDriveSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await refreshDriveDirectory(currentFolder?.id, driveSearch);
  };

  const handleDownload = async (item: DriveFileItem) => {
    const token = getDriveAccessToken();
    if (!token) {
      setSessionInfo(getDriveSessionInfo());
      setDriveError('Reconnect Google Drive to download files.');
      return;
    }
    setDriveError(null);
    try {
      await downloadDriveFile({ accessToken: token, file: item });
    } catch (err) {
      if (err instanceof DriveApiError && err.requiresReauth) {
        setSessionInfo(getDriveSessionInfo());
      }
      setDriveError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleLocalIndex = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await saveRecord<VaultFileRef>(
      'vaultFiles',
      {
        name: file.name.slice(0, 240),
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        category: 'Personal Document',
        storageProvider: 'local_cache',
        uploadStatus: 'local_only',
      },
      false
    );
    e.target.value = '';
  };

  const filtered = vaultFiles.filter((f) => {
    if (categoryFilter !== 'all' && (f.category ?? 'General') !== categoryFilter) return false;
    if (search.trim() && !f.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const isLocalWorkspace = authMode === 'local';

  return (
    <div className="space-y-6">
      {/* Google Drive Session Header */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {sessionInfo.connected ? (
              <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <CloudOff className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {sessionInfo.connected
                  ? 'Google Drive Connected (Least-Privilege Vault Access)'
                  : 'Connect Google Drive to Sync Digital Vault'}
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {sessionInfo.connected
                  ? `Active in-memory Drive session${sessionInfo.accountEmail ? ` for ${sessionInfo.accountEmail}` : ''}. Tokens remain in memory only and clear on sign-out. NEXORA accesses folders and files created or opened with this app (drive.file).`
                  : 'NEXORA uses least-privilege Google Drive access (drive.file) to browse folders, run chunked resumable uploads with cancel and retry, rename, move, delete, and download files without keeping OAuth tokens in browser storage.'}
              </p>
              {isLocalWorkspace && (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  Local Offline Workspace active: Drive catalog references saved here stay on this device until you sign into a verified cloud account.
                </p>
              )}
              {!isLocalWorkspace && !emailVerified && (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  Verify your email address before syncing Drive file metadata to cloud storage.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!sessionInfo.connected ? (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={connectingDrive}
                className="min-h-[44px] inline-flex items-center gap-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0B1220] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                {connectingDrive ? 'Connecting Google Drive...' : 'Sign in with Google for Drive'}
              </button>
            ) : (
              <>
                <label className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Upload to Drive
                  <input
                    type="file"
                    multiple
                    onChange={handleDriveUploadSelection}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Disconnect Drive
                </button>
              </>
            )}

            <label className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
              <FolderLock className="w-3.5 h-3.5" />
              Index Local Metadata
              <input type="file" onChange={handleLocalIndex} className="sr-only" />
            </label>
          </div>
        </div>

        {driveError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{driveError}</span>
          </div>
        )}

        {driveNotice && !driveError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{driveNotice}</span>
          </div>
        )}
      </section>

      {/* Active Resumable Upload Queue */}
      {uploads.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Drive Resumable Transfers ({uploads.length})
            </h3>
            <button
              type="button"
              onClick={() => setUploads((prev) => prev.filter((u) => u.status === 'uploading'))}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              Clear finished
            </button>
          </div>
          <ul className="space-y-2.5">
            {uploads.map((item) => {
              const pct =
                item.totalBytes > 0
                  ? Math.min(100, Math.round((item.uploadedBytes / item.totalBytes) * 100))
                  : item.status === 'completed'
                    ? 100
                    : 0;
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                        {item.file.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {formatDriveFileSize(item.uploadedBytes)} / {formatDriveFileSize(item.totalBytes)} ({pct}%)
                        {item.status === 'completed' ? ' · Uploaded' : ''}
                        {item.status === 'cancelled' ? ' · Cancelled' : ''}
                        {item.status === 'error' ? ` · ${item.error ?? 'Failed'}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.status === 'uploading' && (
                        <button
                          type="button"
                          onClick={() => handleCancelUpload(item.id)}
                          aria-label={`Cancel upload ${item.file.name}`}
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                      {(item.status === 'error' || item.status === 'cancelled') && (
                        <button
                          type="button"
                          onClick={() => handleRetryUpload(item)}
                          aria-label={`Retry upload ${item.file.name}`}
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-md bg-[#3B82F6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-600"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        item.status === 'error'
                          ? 'bg-rose-500'
                          : item.status === 'completed'
                            ? 'bg-emerald-500'
                            : 'bg-[#3B82F6]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Live Google Drive Explorer */}
      {sessionInfo.connected && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Breadcrumbs */}
            <nav aria-label="Google Drive folders" className="flex flex-wrap items-center gap-1 text-xs">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                  <button
                    type="button"
                    onClick={() => handleCrumbClick(idx)}
                    className={`rounded-md px-2 py-1 font-medium transition-colors ${
                      idx === breadcrumbs.length - 1
                        ? 'bg-blue-500/10 text-blue-600 dark:text-sky-400'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <form onSubmit={handleDriveSearchSubmit} className="flex items-center gap-1.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    placeholder="Search Drive files..."
                    aria-label="Search Google Drive"
                    className="min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Find
                </button>
              </form>

              <button
                type="button"
                onClick={() => refreshDriveDirectory(currentFolder?.id, driveSearch)}
                disabled={loadingDrive}
                aria-label="Refresh Drive list"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDrive ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Inline Create Folder Bar */}
          <form onSubmit={handleCreateFolder} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name in current directory..."
              className="min-h-[40px] flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={creatingFolder || !newFolderName.trim()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              {creatingFolder ? 'Creating...' : 'Create Folder'}
            </button>
          </form>

          {loadingDrive ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading Google Drive folder contents...
            </div>
          ) : driveItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {driveSearch.trim()
                ? `No NEXORA-accessible Google Drive items matched "${driveSearch.trim()}".`
                : 'This folder is empty. Upload files or create a subfolder above.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {driveItems.map((item) => {
                const folder = isDriveFolder(item);
                return (
                  <li
                    key={item.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {folder ? (
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        {folder ? (
                          <button
                            type="button"
                            onClick={() => handleOpenFolder(item)}
                            className="text-sm font-medium text-slate-900 dark:text-white hover:text-[#3B82F6] dark:hover:text-sky-400 truncate block text-left"
                          >
                            {item.name}
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {item.name}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {folder ? 'Folder' : `${formatDriveFileSize(item.sizeBytes)} · ${item.mimeType}`}
                          {item.modifiedTime
                            ? ` · Updated ${new Date(item.modifiedTime).toLocaleDateString()}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {!folder && (
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          aria-label={`Download ${item.name}`}
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                      )}
                      {item.webViewLink && (
                        <a
                          href={item.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${item.name} in Google Drive`}
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRenameTarget(item);
                          setRenameValue(item.name);
                        }}
                        aria-label={`Rename ${item.name}`}
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMoveTarget(item);
                          setMoveDestinationId(
                            allDriveFolders.find((f) => f.id !== item.id && f.id !== currentFolder?.id)?.id ??
                              allDriveFolders[0]?.id ??
                              ''
                          );
                        }}
                        aria-label={`Move ${item.name}`}
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <FolderTree className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDriveDeleteTarget(item)}
                        aria-label={`Delete ${item.name} from Drive`}
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Rename Drive Item
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#3B82F6] hover:bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Save Name
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move Modal */}
      {moveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleMoveSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Move &ldquo;{moveTarget.name}&rdquo;
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Destination Folder
              </label>
              <select
                value={moveDestinationId}
                onChange={(e) => setMoveDestinationId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                {allDriveFolders
                  .filter((f) => f.id !== moveTarget.id)
                  .map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!moveDestinationId}
                className="rounded-lg bg-[#3B82F6] hover:bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Move Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Document Metadata Catalog (Synced + Offline References) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Document Metadata Registry ({filtered.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search indexed files..."
              className="min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter file category"
              className="min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              <option value="Personal Document">Personal Document</option>
              <option value="Academic Document">Academic Document</option>
              <option value="Project Resource">Project Resource</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No documents indexed yet. Connect Google Drive to upload cloud files, or use
            &ldquo;Index Local Metadata&rdquo; for offline file references.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((file) => (
              <li key={file.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {file.storageProvider === 'local_cache'
                        ? 'Local Metadata Only'
                        : file.storageProvider === 'google_drive'
                          ? 'Google Drive Synced'
                          : file.storageProvider}{' '}
                      ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatDriveFileSize(file.sizeBytes)}
                      </span>{' '}
                      · {file.mimeType}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {file.driveWebViewLink && (
                    <a
                      href={file.driveWebViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-sky-400"
                      aria-label={`Open ${file.name} link`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(file)}
                    aria-label={`Remove metadata for ${file.name}`}
                    className="p-2 text-slate-400 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Confirm Delete from Google Drive */}
      <ConfirmDialog
        open={!!driveDeleteTarget}
        title={`Permanently delete "${driveDeleteTarget?.name ?? ''}" from Google Drive?`}
        description="This deletes the file or folder directly from your Google Drive account. This action cannot be undone."
        confirmLabel="Delete from Drive"
        destructive
        onCancel={() => setDriveDeleteTarget(null)}
        onConfirm={async () => {
          const target = driveDeleteTarget;
          setDriveDeleteTarget(null);
          if (!target) return;
          const token = getDriveAccessToken();
          if (!token) {
            setSessionInfo(getDriveSessionInfo());
            setDriveError('Reconnect Google Drive before deleting Drive items.');
            return;
          }
          try {
            await deleteDriveFile({ accessToken: token, fileId: target.id });
            await refreshDriveDirectory(currentFolder?.id, driveSearch);
            setDriveNotice(`Deleted "${target.name}" from Google Drive.`);
          } catch (err) {
            setDriveError(err instanceof Error ? err.message : 'Failed to delete from Drive.');
          }
        }}
      />

      {/* Confirm Delete Local Catalog Entry */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Remove "${deleteTarget?.name ?? ''}"?`}
        description="This removes the file reference from your NEXORA metadata catalog."
        confirmLabel="Remove"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRecord('vaultFiles', deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
