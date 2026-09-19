export type SourceHealth = "ok" | "stale" | "failing" | "disabled";

export function SourceHealthLastUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
): Date | null {
  const data = info || {};
  const lastItem = data.lastItemDate ? new Date(data.lastItemDate) : null;
  if (lastItem && !isNaN(lastItem.getTime())) {
    return lastItem;
  }
  const lastFetch = data.dateFetched ? new Date(data.dateFetched) : null;
  if (lastFetch && !isNaN(lastFetch.getTime())) {
    return lastFetch;
  }
  return null;
}

export function SourceIsStale(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  staleThresholdMs: number,
  now: number = Date.now(),
): boolean {
  if (!staleThresholdMs || staleThresholdMs <= 0) {
    return false;
  }
  const lastUpdate = SourceHealthLastUpdate(info);
  if (!lastUpdate) {
    return false;
  }
  return now - lastUpdate.getTime() > staleThresholdMs;
}

export function SourceIsFailing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  errorThreshold: number,
): boolean {
  if (!errorThreshold || errorThreshold <= 0) {
    return false;
  }
  const data = info || {};
  const errorCount = Number(data.fetchErrorCount) || 0;
  return errorCount >= errorThreshold;
}

export function SourceGetHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  staleThresholdMs: number,
  errorThreshold: number,
  now: number = Date.now(),
): SourceHealth {
  if (SourceIsAutoDisabled(info)) {
    return "disabled";
  }
  if (SourceIsFailing(info, errorThreshold)) {
    return "failing";
  }
  if (SourceIsStale(info, staleThresholdMs, now)) {
    return "stale";
  }
  return "ok";
}

export function SourceIsAutoDisabled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
): boolean {
  return Boolean((info || {}).autoDisabled);
}

export function SourceShouldAutoDisable(
  fetchErrorCount: number,
  threshold: number,
): boolean {
  if (!threshold || threshold <= 0) {
    return false;
  }
  return (Number(fetchErrorCount) || 0) >= threshold;
}

export function SourceBackoffMs(
  fetchErrorCount: number,
  baseFrequencyMs: number,
  maxBackoffMs: number,
): number {
  if (!fetchErrorCount || fetchErrorCount <= 0) {
    return 0;
  }
  return Math.min(
    baseFrequencyMs * Math.pow(2, fetchErrorCount - 1),
    maxBackoffMs,
  );
}

export function SourceIsDueForFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any,
  baseFrequencyMs: number,
  now: number,
  maxBackoffMs: number,
): boolean {
  const data = info || {};
  if (data.autoDisabled) {
    return false;
  }
  const retryAfterUntil = data.retryAfterUntil
    ? new Date(data.retryAfterUntil)
    : null;
  if (
    retryAfterUntil &&
    !isNaN(retryAfterUntil.getTime()) &&
    retryAfterUntil.getTime() > now
  ) {
    return false;
  }
  const errorCount = Number(data.fetchErrorCount) || 0;
  const frequency = Number(data.fetchFrequency) || baseFrequencyMs;
  const attemptDate =
    errorCount > 0
      ? data.lastAttemptDate || data.dateFetched
      : data.dateFetched;
  if (!attemptDate) {
    return true;
  }
  const referenceDate = new Date(attemptDate);
  if (isNaN(referenceDate.getTime())) {
    return true;
  }
  const backoffMs = SourceBackoffMs(errorCount, frequency, maxBackoffMs);
  return now - referenceDate.getTime() > Math.max(frequency, backoffMs);
}
