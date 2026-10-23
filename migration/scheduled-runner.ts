type JobResult = Record<string, unknown>;

function count(result: JobResult, field: string): number {
  const value = result[field];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function failedResult(result: JobResult): boolean {
  if (['failed', 'uncertain', 'markerFailed', 'reminderFailed'].some(field => count(result, field) > 0)) return true;
  const channels = result.channels;
  if (channels && typeof channels === 'object') {
    for (const name of ['email', 'line']) {
      const channel = (channels as JobResult)[name];
      if (channel && typeof channel === 'object' &&
          ['failed', 'uncertain'].some(field => count(channel as JobResult, field) > 0)) return true;
    }
  }
  return false;
}

// Run independent jobs even if an earlier one fails, then expose the aggregate result.
// Only bounded counters and known route names enter logs; response/error strings may contain secrets.
export async function runScheduledJobs(
  paths: string[],
  invoke: (path: string) => Promise<Response>,
  log: (result: { path: string; status: number | null; outcome: 'ok' | 'failed'; counts?: Record<string, number> }) => void = result => console.log('Staging scheduled job result', result),
): Promise<void> {
  const failures: string[] = [];
  for (const path of paths) {
    let status: number | null = null;
    try {
      const response = await invoke(path);
      status = response.status;
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid job result');
      const body = result as JobResult;
      const failed = !response.ok || failedResult(body);
      const counts = Object.fromEntries(['processed', 'sent', 'skipped', 'failed', 'uncertain', 'markerFailed', 'reminderFailed'].map(field => [field, count(body, field)]));
      log({ path, status, outcome: failed ? 'failed' : 'ok', counts });
      if (failed) failures.push(path);
    } catch {
      failures.push(path);
      log({ path, status, outcome: 'failed' });
    }
  }
  if (failures.length) throw new Error(`Staging scheduled jobs failed (${failures.length}/${paths.length}): ${failures.join(', ')}`);
}
