import React, { useMemo, useState } from 'react';
import { BookMarked, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { computeCourseGradeSummary, evaluateGradeLabel } from '../lib/academic';
import { formatDisplayDate, getTodayKey } from '../lib/planner';
import { AssignmentInputSchema, CourseInputSchema, GradeInputSchema } from '../lib/validation';
import type { Assignment, Course, GradeRecord } from '../types/nexora';

export const AcademicModule: React.FC = () => {
  const { settings, courses, assignments, grades, saveRecord, deleteRecord } = useWorkspace();
  const todayKey = getTodayKey(settings.timezone);

  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  // Course form
  const [code, setCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [semester, setSemester] = useState('Semester 1 2026');
  const [lecturer, setLecturer] = useState('');
  const [gradingScale, setGradingScale] = useState('University Distinction Scale');

  // Assignment form
  const [assignCourseId, setAssignCourseId] = useState('');
  const [assignTitle, setAssignTitle] = useState('');
  const [activityType, setActivityType] = useState<Assignment['activityType']>('assignment');
  const [assignDue, setAssignDue] = useState(todayKey);

  // Grade form
  const [gradeCourseId, setGradeCourseId] = useState('');
  const [gradeTitle, setGradeTitle] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [weight, setWeight] = useState('20');
  const [isEstimated, setIsEstimated] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    col: 'courses' | 'assignments' | 'grades';
    id: string;
    label: string;
  } | null>(null);

  const activeCourseId = assignCourseId || courses[0]?.id || '';
  const activeGradeCourseId = gradeCourseId || courses[0]?.id || '';

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = CourseInputSchema.safeParse({
      code,
      title: courseTitle,
      semester,
      lecturer: lecturer || undefined,
      status: 'active',
      gradingScale,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid course details.');
      return;
    }
    const created = await saveRecord<Course>('courses', parsed.data, false);
    setCode('');
    setCourseTitle('');
    setLecturer('');
    setAssignCourseId(created.id);
    setGradeCourseId(created.id);
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = AssignmentInputSchema.safeParse({
      courseId: activeCourseId,
      title: assignTitle,
      activityType,
      dueDate: assignDue,
      status: 'pending',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Create a course first before adding coursework.');
      return;
    }
    await saveRecord<Assignment>('assignments', parsed.data, false);
    setAssignTitle('');
  };

  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = GradeInputSchema.safeParse({
      courseId: activeGradeCourseId,
      title: gradeTitle,
      score: Number(score),
      maxScore: Number(maxScore),
      weight: Number(weight),
      isEstimated,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter valid numeric grade values.');
      return;
    }
    await saveRecord<GradeRecord>('grades', parsed.data, false);
    setGradeTitle('');
    setScore('');
  };

  const visibleAssignments = useMemo(
    () =>
      assignments
        .filter((a) => selectedCourseId === 'all' || a.courseId === selectedCourseId)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [assignments, selectedCourseId]
  );

  const visibleGrades = useMemo(
    () => grades.filter((g) => selectedCourseId === 'all' || g.courseId === selectedCourseId),
    [grades, selectedCourseId]
  );

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Course Overview Cards */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-blue-600 dark:text-sky-400" />
              Courses &amp; Configurable Grading Scales
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Recorded grades are strictly separated from estimated projections.
            </p>
          </div>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            aria-label="Filter by course"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </div>

        {courses.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
            No courses added yet. Add your first course below to track coursework and grades.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => {
              const courseGrades = grades.filter((g) => g.courseId === course.id);
              const summary = computeCourseGradeSummary(courseGrades);
              const recordedLabel = evaluateGradeLabel(
                summary.recordedAveragePercent,
                course.gradingScale
              );
              return (
                <div
                  key={course.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono text-blue-600 dark:text-sky-400">
                          {course.code} · {course.semester}
                        </p>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                          {course.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            col: 'courses',
                            id: course.id,
                            label: `${course.code} ${course.title}`,
                          })
                        }
                        aria-label={`Delete course ${course.title}`}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {course.lecturer && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Lecturer: {course.lecturer}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Recorded Avg</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                        {summary.recordedAveragePercent !== null
                          ? `${summary.recordedAveragePercent}% (${recordedLabel})`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Projected (w/ Est.)</span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {summary.projectedAveragePercent !== null
                          ? `${summary.projectedAveragePercent}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Course Form */}
        <form onSubmit={handleAddCourse} className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code (e.g. CSC 310)"
            required
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
            placeholder="Course Title"
            required
            className="lg:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="Semester"
            required
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            value={gradingScale}
            onChange={(e) => setGradingScale(e.target.value)}
            placeholder="Scale (e.g. A:80,B:70,C:60,F:0)"
            title="Use preset name or custom thresholds like A:80,B:70,C:60,D:50,F:0"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Course
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Academic Activities */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Assignments, Exams &amp; Practicals
          </h2>

          <form onSubmit={handleAddAssignment} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={activeCourseId}
              onChange={(e) => setAssignCourseId(e.target.value)}
              aria-label="Assignment course"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              {courses.length === 0 && <option value="">Add a course first</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as Assignment['activityType'])}
              aria-label="Activity type"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="assignment">Assignment</option>
              <option value="coursework">Coursework</option>
              <option value="exam">Examination</option>
              <option value="practical">Practical Session</option>
              <option value="research">Research Activity</option>
            </select>
            <input
              type="text"
              value={assignTitle}
              onChange={(e) => setAssignTitle(e.target.value)}
              placeholder="Deliverable title"
              required
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={assignDue}
                onChange={(e) => setAssignDue(e.target.value)}
                required
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={courses.length === 0}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>

          {visibleAssignments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No academic deliverables recorded.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleAssignments.map((a) => {
                const c = courses.find((x) => x.id === a.courseId);
                return (
                  <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 dark:text-white truncate">{a.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c?.code ?? 'Course'} · {a.activityType} ·{' '}
                        <span className="font-mono tabular-nums">
                          {formatDisplayDate(a.dueDate, settings.dateFormat)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={a.status}
                        onChange={(e) =>
                          saveRecord<Assignment>(
                            'assignments',
                            { ...a, status: e.target.value as Assignment['status'] },
                            true
                          )
                        }
                        aria-label={`Status for ${a.title}`}
                        className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="submitted">Submitted</option>
                        <option value="graded">Graded</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({ col: 'assignments', id: a.id, label: a.title })
                        }
                        aria-label={`Delete ${a.title}`}
                        className="p-1 text-slate-400 hover:text-rose-600"
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

        {/* Assessment & Grade Records */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Assessment Marks (Recorded vs. Estimated)
          </h2>

          <form onSubmit={handleAddGrade} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={activeGradeCourseId}
              onChange={(e) => setGradeCourseId(e.target.value)}
              aria-label="Grade course"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              {courses.length === 0 && <option value="">Add a course first</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={gradeTitle}
              onChange={(e) => setGradeTitle(e.target.value)}
              placeholder="Assessment (e.g. Midterm)"
              required
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <input
                type="number"
                step="0.1"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Score"
                required
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
              <input
                type="number"
                step="0.1"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                placeholder="Max"
                required
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
              <input
                type="number"
                step="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Weight %"
                required
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isEstimated}
                  onChange={(e) => setIsEstimated(e.target.checked)}
                />
                Mark as Estimated Forecast (not officially recorded)
              </label>
              <button
                type="submit"
                disabled={courses.length === 0}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Record Grade
              </button>
            </div>
          </form>

          {visibleGrades.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No marks recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleGrades.map((g) => {
                const c = courses.find((x) => x.id === g.courseId);
                const pct = Math.round((g.score / g.maxScore) * 1000) / 10;
                return (
                  <li key={g.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 dark:text-white truncate">{g.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c?.code ?? 'Course'} · {g.isEstimated ? 'Estimated' : 'Recorded'} · Weight{' '}
                        {g.weight}%
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                        {g.score}/{g.maxScore} ({pct}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ col: 'grades', id: g.id, label: g.title })}
                        aria-label={`Delete grade ${g.title}`}
                        className="p-1 text-slate-400 hover:text-rose-600"
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
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.label ?? ''}"?`}
        description="This academic record will be permanently removed."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRecord(deleteTarget.col, deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
