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
  public add(promiseGenerator) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const signal = controller.signal;

      const wrappedPromise = () =>
        new Promise((innerResolve, innerReject) => {
          const timeoutId = setTimeout(() => {
            controller.abort();
            innerReject(new Error("Promise cancelled due to timeout"));
          }, this.timeout);

          Promise.resolve()
            .then(() => promiseGenerator(signal))
            .then((result) => {
              clearTimeout(timeoutId);
              innerResolve(result);
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              innerReject(error);
            });
        });

      this.queue.push({ wrappedPromise, resolve });
      this.runNext();
    });
  }

  private runNext() {
    if (
      this.currentConcurrency < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const { wrappedPromise, resolve } = this.queue.shift();
      this.currentConcurrency++;

      wrappedPromise()
        .then((result) => {
          resolve(result);
          this.currentConcurrency--;
          this.runNext();
        })
        .catch((error) => {
          console.error(
            `PromisePool task failed: ${error?.message ?? String(error)}`,
          );
          resolve(undefined);
          this.currentConcurrency--;
          this.runNext();
        });
    }
  }
}
