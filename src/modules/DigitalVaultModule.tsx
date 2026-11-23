import React, { useState } from 'react';
import { CloudOff, FileText, FolderLock, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useWorkspace } from '../contexts/WorkspaceContext';
import type { VaultFileRef } from '../types/nexora';

export const DigitalVaultModule: React.FC = () => {
  const { vaultFiles, saveRecord, deleteRecord } = useWorkspace();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VaultFileRef | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Honest External Integration Status Banner */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CloudOff className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Google Drive Integration — Phase 4 OAuth Setup Required
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Google Drive (<code className="font-mono">drive.file</code> least-privilege scope)
                is architected for Phase 4. To preserve real integration integrity, NEXORA never
                simulates Drive uploads. Once Google Workspace OAuth is enabled for this applet, you
                will be able to browse, resumable-upload, rename, and download Drive files directly.
              </p>
            </div>
          </div>

          <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0">
            <FolderLock className="w-3.5 h-3.5" />
            Index Local Metadata
            <input type="file" onChange={handleLocalIndex} className="sr-only" />
          </label>
        </div>
      </section>

      {/* File Metadata Catalog */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Document Metadata Registry ({filtered.length})
          </h2>
          <div className="flex items-center gap-2.5">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search indexed files..."
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter file category"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
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
            No documents indexed yet. Use &ldquo;Index Local Metadata&rdquo; to catalog a file reference
            locally (local metadata is not cloud-backed until Drive OAuth is connected).
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
                        ? 'Local Metadata Only (Not Cloud Backed)'
                        : file.storageProvider}{' '}
                      · <span className="font-mono tabular-nums">{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</span> · {file.mimeType}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(file)}
                  aria-label={`Remove metadata for ${file.name}`}
                  className="p-1.5 text-slate-400 hover:text-rose-600 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Remove "${deleteTarget?.name ?? ''}"?`}
        description="This removes the file reference from your NEXORA catalog."
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
