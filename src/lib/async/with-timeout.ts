// Races a promise against a timer (B-50). On timeout it resolves with the
// caller's fallback instead of rejecting, so the "best-effort, never
// throws" notifier loops keep going to the next recipient. The original
// promise is not cancelled — it just stops being waited for, which is
// what keeps one hung network call from eating the cron's 300 s budget.
export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const EXTERNAL_CALL_TIMEOUT_MS = 10_000;
