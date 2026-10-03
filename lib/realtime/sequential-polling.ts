export interface SequentialPollingOptions<T> {
  intervalMs: number;
  load(signal: AbortSignal): Promise<T>;
  onStart?(): void;
  onSuccess(value: T): void;
  onError(error: unknown): void;
}

export interface SequentialPollingController {
  refresh(): void;
  stop(): void;
}

export function startSequentialPolling<T>(options: SequentialPollingOptions<T>): SequentialPollingController {
  let disposed = false;
  let inFlight = false;
  let refreshRequested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const poll = async () => {
    if (disposed || inFlight) return;
    inFlight = true;
    const requestController = new AbortController();
    controller = requestController;
    options.onStart?.();
    try {
      const value = await options.load(requestController.signal);
      if (!disposed) options.onSuccess(value);
    } catch (error) {
      if (!disposed && !requestController.signal.aborted) options.onError(error);
    } finally {
      if (controller === requestController) controller = null;
      inFlight = false;
      if (!disposed && refreshRequested) {
        refreshRequested = false;
        void poll();
      } else if (!disposed) {
        timer = setTimeout(() => {
          timer = null;
          void poll();
        }, options.intervalMs);
      }
    }
  };

  void poll();
  return {
    refresh() {
      if (disposed) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) {
        refreshRequested = true;
        return;
      }
      void poll();
    },
    stop() {
      disposed = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    },
  };
}
