export type ModuleId =
  | 'overview'
  | 'planner'
  | 'academic'
  | 'finance'
  | 'goals'
  | 'developer'
  | 'vault'
  | 'knowledge'
  | 'assistant'
  | 'settings';

export type ThemePreference = 'dark' | 'light' | 'system';
export type DateFormatOption = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type SyncState =
  | 'local_saved'
  | 'waiting_sync'
  | 'syncing'
  | 'synced'
  | 'sync_failed'
  | 'conflict';

export interface DashboardWidgetConfig {
  id:
    | 'priorities'
    | 'events'
    | 'academic'
    | 'finance'
    | 'goals'
    | 'projects'
    | 'documents'
    | 'ai_insights';
  label: string;
  visible: boolean;
  order: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  bio?: string;
  roleTitle?: string;
  institution?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  uid: string;
  theme: ThemePreference;
  currency: string;
  timezone: string;
  dateFormat: DateFormatOption;
  language: string;
  notificationsEnabled: boolean;
  deadlineAlerts: boolean;
  budgetAlerts: boolean;
  dashboardWidgets: DashboardWidgetConfig[];
  updatedAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  uid: string;
  title: string;
  notes?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'completed';
  dueDate?: string;
  category?: string;
  recurring: 'none' | 'daily' | 'weekly' | 'monthly';
  subtasks?: Subtask[];
  version: number;
  syncState?: SyncState;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  uid: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  category?: string;
  location?: string;
  allDay: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  uid: string;
  code: string;
  title: string;
  semester: string;
  lecturer?: string;
  status: 'active' | 'completed' | 'planned';
  credits?: number;
  gradingScale?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: string;
  uid: string;
  courseId: string;
  title: string;
  activityType: 'assignment' | 'coursework' | 'exam' | 'practical' | 'research';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'graded';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GradeRecord {
  id: string;
  uid: string;
  courseId: string;
  title: string;
  score: number;
  maxScore: number;
  weight: number;
  isEstimated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  uid: string;
  type: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  category: string;
  description?: string;
  paymentMethod?: string;
  transactionDate: string;
  isEstimate: boolean;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  uid: string;
  category: string;
  limitMinor: number;
  currency: string;
  monthKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoal {
  id: string;
  uid: string;
  title: string;
  targetMinor: number;
  currentMinor: number;
  currency: string;
  targetDate?: string;
  status: 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  uid: string;
  title: string;
  description?: string;
  horizon: 'short_term' | 'long_term';
  status: 'active' | 'paused' | 'archived' | 'completed';
  targetDate?: string;
  progressPercent: number;
  milestones?: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  uid: string;
  title: string;
  frequency: 'daily' | 'weekly';
  targetPerPeriod: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitEntry {
  id: string;
  uid: string;
  habitId: string;
  dateKey: string;
  completed: boolean;
  createdAt: string;
}

export interface DevProject {
  id: string;
  uid: string;
  name: string;
  description?: string;
  technologies?: string[];
  status: 'planning' | 'active' | 'testing' | 'released' | 'archived';
  deadline?: string;
  repoUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DevTask {
  id: string;
  uid: string;
  projectId: string;
  title: string;
  kind: 'task' | 'bug' | 'feature' | 'test';
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  devLog?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeNote {
  id: string;
  uid: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  isFavorite: boolean;
  linkedCourseId?: string;
  linkedProjectId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultFileRef {
  id: string;
  uid: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category?: string;
  storageProvider: 'local_cache' | 'google_drive' | 'firebase_storage';
  driveFileId?: string;
  uploadStatus: 'local_only' | 'pending' | 'synced' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  uid: string;
  title: string;
  body: string;
  category: 'task' | 'academic' | 'finance' | 'goal' | 'vault' | 'system';
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  uid: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'export';
  summary: string;
  createdAt: string;
}

export interface SyncQueueItem {
  id: string;
  uid: string;
  collectionName: string;
  docId: string;
  operation: 'create' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}
