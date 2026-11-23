import type { GradeRecord } from '../types/nexora';

export interface GradeSummary {
  recordedAveragePercent: number | null;
  recordedWeightTotal: number;
  projectedAveragePercent: number | null;
  projectedWeightTotal: number;
  recordedCount: number;
  estimatedCount: number;
}

/**
 * Computes weighted course progress while strictly separating
 * official recorded grades from user-entered estimated grades.
 */
export function computeCourseGradeSummary(grades: GradeRecord[]): GradeSummary {
  const recorded = grades.filter((g) => !g.isEstimated && g.maxScore > 0);
  const estimated = grades.filter((g) => g.isEstimated && g.maxScore > 0);

  const calcWeighted = (items: GradeRecord[]): { avg: number | null; weightTotal: number } => {
    if (items.length === 0) return { avg: null, weightTotal: 0 };
    const totalWeight = items.reduce((acc, g) => acc + g.weight, 0);
    if (totalWeight > 0) {
      const weightedSum = items.reduce(
        (acc, g) => acc + (g.score / g.maxScore) * 100 * g.weight,
        0
      );
      return {
        avg: Math.round((weightedSum / totalWeight) * 10) / 10,
        weightTotal: Math.round(totalWeight * 10) / 10,
      };
    }
    const simpleSum = items.reduce((acc, g) => acc + (g.score / g.maxScore) * 100, 0);
    return {
      avg: Math.round((simpleSum / items.length) * 10) / 10,
      weightTotal: 0,
    };
  };

  const recRes = calcWeighted(recorded);
  const allRes = calcWeighted([...recorded, ...estimated]);

  return {
    recordedAveragePercent: recRes.avg,
    recordedWeightTotal: recRes.weightTotal,
    projectedAveragePercent: allRes.avg,
    projectedWeightTotal: allRes.weightTotal,
    recordedCount: recorded.length,
    estimatedCount: estimated.length,
  };
}

export interface GradingThreshold {
  label: string;
  minPercent: number;
}

export const DEFAULT_GRADING_SCALES: Record<string, GradingThreshold[]> = {
  'Standard Percentage (A-F)': [
    { label: 'A', minPercent: 80 },
    { label: 'B', minPercent: 70 },
    { label: 'C', minPercent: 60 },
    { label: 'D', minPercent: 50 },
    { label: 'F', minPercent: 0 },
  ],
  'University Distinction Scale': [
    { label: 'Distinction', minPercent: 75 },
    { label: 'Credit', minPercent: 60 },
    { label: 'Pass', minPercent: 50 },
    { label: 'Fail', minPercent: 0 },
  ],
};

export function parseCustomGradingScale(scaleString?: string): GradingThreshold[] {
  if (!scaleString) return DEFAULT_GRADING_SCALES['Standard Percentage (A-F)'];
  if (DEFAULT_GRADING_SCALES[scaleString]) return DEFAULT_GRADING_SCALES[scaleString];

  // Parse format like "A:85,B:75,C:65,D:50,F:0"
  const parsed: GradingThreshold[] = [];
  for (const part of scaleString.split(',')) {
    const [labelRaw, minRaw] = part.split(':').map((s) => s.trim());
    const minVal = Number(minRaw);
    if (labelRaw && Number.isFinite(minVal)) {
      parsed.push({ label: labelRaw, minPercent: minVal });
    }
  }
  if (parsed.length === 0) return DEFAULT_GRADING_SCALES['Standard Percentage (A-F)'];
  return parsed.sort((a, b) => b.minPercent - a.minPercent);
}

export function evaluateGradeLabel(percent: number | null, scaleString?: string): string {
  if (percent === null) return 'No marks yet';
  const thresholds = parseCustomGradingScale(scaleString);
  for (const t of thresholds) {
    if (percent >= t.minPercent) return t.label;
  }
  return thresholds[thresholds.length - 1]?.label ?? 'N/A';
}
