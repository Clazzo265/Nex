import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMinorCurrency } from '../../lib/finance';
import type { ModuleId } from '../../types/nexora';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  module: ModuleId;
  moduleLabel: string;
}

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (mod: ModuleId) => void;
}

const RECENT_KEY = 'nexora_recent_searches';

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const { tasks, events, courses, transactions, goals, projects, notes, vaultFiles } =
    useWorkspace();
  const [queryText, setQueryText] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open, queryText, filterModule]);

  const allItems: SearchResult[] = useMemo(() => {
    const out: SearchResult[] = [];
    for (const t of tasks) {
      out.push({
        id: t.id,
        title: t.title,
        subtitle: `${t.priority} · ${t.status}${t.dueDate ? ` · ${t.dueDate}` : ''}`,
        module: 'planner',
        moduleLabel: 'Planner',
      });
    }
    for (const ev of events) {
      out.push({
        id: ev.id,
        title: ev.title,
        subtitle: `Event · ${ev.startTime.slice(0, 16)}`,
        module: 'planner',
        moduleLabel: 'Planner',
      });
    }
    for (const c of courses) {
      out.push({
        id: c.id,
        title: `${c.code} — ${c.title}`,
        subtitle: `${c.semester} · ${c.status}`,
        module: 'academic',
        moduleLabel: 'Academic Hub',
      });
    }
    for (const tx of transactions) {
      out.push({
        id: tx.id,
        title: `${tx.category} (${formatMinorCurrency(tx.amountMinor, tx.currency)})`,
        subtitle: `${tx.type} · ${tx.transactionDate}${tx.description ? ` · ${tx.description}` : ''}`,
        module: 'finance',
        moduleLabel: 'Finance',
      });
    }
    for (const g of goals) {
      out.push({
        id: g.id,
        title: g.title,
        subtitle: `${g.horizon.replace('_', ' ')} · ${g.progressPercent}%`,
        module: 'goals',
        moduleLabel: 'Goals & Habits',
      });
    }
    for (const p of projects) {
      out.push({
        id: p.id,
        title: p.name,
        subtitle: `${p.status}${p.technologies?.length ? ` · ${p.technologies.join(', ')}` : ''}`,
        module: 'developer',
        moduleLabel: 'Developer Workspace',
      });
    }
    for (const n of notes) {
      out.push({
        id: n.id,
        title: n.title,
        subtitle: `${n.category || 'Note'}${n.tags?.length ? ` · ${n.tags.join(', ')}` : ''}`,
        module: 'knowledge',
        moduleLabel: 'Knowledge Library',
      });
    }
    for (const f of vaultFiles) {
      out.push({
        id: f.id,
        title: f.name,
        subtitle: `${f.storageProvider} · ${Math.round(f.sizeBytes / 1024)} KB`,
        module: 'vault',
        moduleLabel: 'Digital Vault',
      });
    }
    return out;
  }, [tasks, events, courses, transactions, goals, projects, notes, vaultFiles]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return allItems
      .filter((item) => {
        if (filterModule !== 'all' && item.module !== filterModule) return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.moduleLabel.toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [allItems, queryText, filterModule]);

  const commitSelection = (item: SearchResult) => {
    if (queryText.trim()) {
      const next = [queryText.trim(), ...recentSearches.filter((r) => r !== queryText.trim())].slice(0, 5);
      setRecentSearches(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
    }
    onNavigate(item.module);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      commitSelection(filtered[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global NEXORA Search"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 pt-16 sm:pt-24 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search tasks, courses, transactions, projects, notes, or files..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText('')}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close global search"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          {[
            ['all', 'All'],
            ['planner', 'Planner'],
            ['academic', 'Academic'],
            ['finance', 'Finance'],
            ['goals', 'Goals'],
            ['developer', 'Projects'],
            ['knowledge', 'Notes'],
            ['vault', 'Vault'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilterModule(id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                filterModule === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {!queryText && recentSearches.length > 0 && (
            <div className="px-2 py-1.5 mb-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Recent Searches
              </p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQueryText(term)}
                    className="text-xs text-blue-600 dark:text-sky-400 hover:underline"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No matching records found in your workspace.
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((item, idx) => (
                <li key={`${item.module}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => commitSelection(item)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-4 transition-colors ${
                      idx === selectedIndex
                        ? 'bg-blue-600/10 text-blue-700 dark:text-sky-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                      {item.moduleLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
