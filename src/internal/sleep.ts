/** Resolves after `ms` milliseconds, or rejects early if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toError(signal.reason));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(toError(signal.reason));
      },
      { once: true },
    );
  });
}

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(`Aborted: ${String(reason)}`);
}
