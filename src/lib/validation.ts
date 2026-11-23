import { z } from 'zod';

export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function isSafeHttpUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export const TaskInputSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200, 'Max 200 characters'),
  notes: z.string().max(2000, 'Notes max 2,000 characters').optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['todo', 'in_progress', 'completed']).default('todo'),
  dueDate: z.string().max(40).optional(),
  category: z.string().trim().max(60).optional(),
  recurring: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
});

export const EventInputSchema = z.object({
  title: z.string().trim().min(1, 'Event title is required').max(200),
  description: z.string().max(1000).optional(),
  startTime: z.string().min(1, 'Start time is required').max(40),
  endTime: z.string().min(1, 'End time is required').max(40),
  category: z.string().trim().max(60).optional(),
  location: z.string().trim().max(160).optional(),
  allDay: z.boolean().default(false),
});

export const CourseInputSchema = z.object({
  code: z.string().trim().min(1, 'Course code is required').max(32),
  title: z.string().trim().min(1, 'Course title is required').max(160),
  semester: z.string().trim().min(1, 'Semester is required').max(60),
  lecturer: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'completed', 'planned']).default('active'),
  credits: z.number().min(0).max(100).optional(),
  gradingScale: z.string().trim().max(120).optional(),
});

export const AssignmentInputSchema = z.object({
  courseId: z.string().min(1).max(128).regex(ID_REGEX, 'Invalid course reference'),
  title: z.string().trim().min(1, 'Title is required').max(200),
  activityType: z.enum(['assignment', 'coursework', 'exam', 'practical', 'research']),
  dueDate: z.string().min(1, 'Due date is required').max(40),
  status: z.enum(['pending', 'in_progress', 'submitted', 'graded']).default('pending'),
  notes: z.string().max(1500).optional(),
});

export const GradeInputSchema = z.object({
  courseId: z.string().min(1).max(128).regex(ID_REGEX, 'Invalid course reference'),
  title: z.string().trim().min(1, 'Assessment title is required').max(160),
  score: z.number().min(0, 'Score cannot be negative'),
  maxScore: z.number().positive('Max score must be greater than zero'),
  weight: z.number().min(0).max(100),
  isEstimated: z.boolean(),
});

export const TransactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  amountMajor: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid positive amount (up to 2 decimal places)'),
  currency: z.string().trim().min(3).max(6),
  category: z.string().trim().min(1, 'Category is required').max(60),
  description: z.string().trim().max(300).optional(),
  paymentMethod: z.string().trim().max(60).optional(),
  transactionDate: z.string().min(1, 'Date is required').max(40),
  isEstimate: z.boolean().default(false),
});

export const BudgetInputSchema = z.object({
  category: z.string().trim().min(1, 'Category is required').max(60),
  limitMajor: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid limit amount'),
  currency: z.string().trim().min(3).max(6),
  monthKey: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM month format'),
});

export const SavingsGoalInputSchema = z.object({
  title: z.string().trim().min(1, 'Goal title is required').max(120),
  targetMajor: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid positive target amount'),
  currency: z.string().trim().min(3).max(6),
  targetDate: z.string().max(40).optional(),
});

export const GoalInputSchema = z.object({
  title: z.string().trim().min(1, 'Goal title is required').max(160),
  description: z.string().max(1000).optional(),
  horizon: z.enum(['short_term', 'long_term']),
  targetDate: z.string().max(40).optional(),
});

export const HabitInputSchema = z.object({
  title: z.string().trim().min(1, 'Habit title is required').max(120),
  frequency: z.enum(['daily', 'weekly']),
  targetPerPeriod: z.number().int().min(1).max(31),
});

export const DevProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(140),
  description: z.string().max(1500).optional(),
  technologies: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  status: z.enum(['planning', 'active', 'testing', 'released', 'archived']).default('active'),
  deadline: z.string().max(40).optional(),
  repoUrl: z
    .string()
    .trim()
    .max(300)
    .refine((val) => isSafeHttpUrl(val), 'Repository URL must start with https:// or http://')
    .optional(),
  notes: z.string().max(3000).optional(),
});

export const DevTaskInputSchema = z.object({
  projectId: z.string().min(1).max(128).regex(ID_REGEX, 'Invalid project reference'),
  title: z.string().trim().min(1, 'Title is required').max(200),
  kind: z.enum(['task', 'bug', 'feature', 'test']),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  devLog: z.string().max(1500).optional(),
});

export const NoteInputSchema = z.object({
  title: z.string().trim().min(1, 'Note title is required').max(200),
  content: z.string().max(20000),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  linkedCourseId: z.string().max(128).optional(),
  linkedProjectId: z.string().max(128).optional(),
});

export const ProfileInputSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(120),
  bio: z.string().max(500).optional(),
  roleTitle: z.string().trim().max(100).optional(),
  institution: z.string().trim().max(140).optional(),
  location: z.string().trim().max(120).optional(),
});
