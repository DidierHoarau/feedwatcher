import { OTelLogger } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("PromisePool");

export class PromisePool {
  private maxConcurrency: number;
  private currentConcurrency: number;
  private queue: any[];
  private timeout: number;

  constructor(maxConcurrency, timeout = 3600000) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = 0;
    this.queue = [];
    this.timeout = timeout;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getInFlightCount(): number {
    return this.currentConcurrency;
  }

  // Tasks are best-effort: the returned promise resolves with the task
  // result, or with undefined when the task failed or timed out (the error
  // is logged). A failing task must never produce an unhandled rejection.
  // On timeout the signal is aborted but the slot stays taken until the task
  // actually settles, so getInFlightCount() reflects real in-flight work.
  public add(promiseGenerator) {
    return new Promise((resolve) => {
      this.queue.push({ promiseGenerator, resolve });
      this.runNext();
    });
  }

  private runNext() {
    if (
      this.currentConcurrency < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const { promiseGenerator, resolve } = this.queue.shift();
      this.currentConcurrency++;
      const controller = new AbortController();
      let settled = false;
      let released = false;

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        controller.abort();
        logger.error(
          "PromisePool task failed: Promise cancelled due to timeout",
        );
        resolve(undefined);
      }, this.timeout);

      // The slot is released only when the underlying task settles, and
      // before the caller resumes, so in-flight/queue counts stay truthful.
      const release = () => {
        if (released) {
          return;
        }
        released = true;
        clearTimeout(timeoutId);
        this.currentConcurrency--;
        this.runNext();
      };

      Promise.resolve()
        .then(() => promiseGenerator(controller.signal))
        .then((result) => {
          if (!settled) {
            settled = true;
            resolve(result);
          }
          release();
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            logger.error(
              `PromisePool task failed: ${error?.message ?? String(error)}`,
            );
            resolve(undefined);
          }
          release();
        });
    }
  }
}
