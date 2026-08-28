import type { OperationsMetric } from './types';

type CountQueryResult = { count?: number | null; error?: { message?: string } | null };

export function metricFromCount(result: CountQueryResult, label: string): OperationsMetric {
  if (result.error) return { value: null, error: `No fue posible cargar ${label}.` };
  if (typeof result.count !== 'number') return { value: null, error: `No fue posible verificar ${label}.` };
  return { value: result.count, error: null };
}

export function combineMetrics(metrics: OperationsMetric[], label: string): OperationsMetric {
  if (metrics.some((metric) => metric.error)) return { value: null, error: `No fue posible cargar ${label}.` };
  return { value: metrics.reduce((sum, metric) => sum + (metric.value ?? 0), 0), error: null };
}

export function metricValue(metric: OperationsMetric) {
  return metric.error ? null : metric.value;
}
