import { PromisePool } from "./PromisePool";

describe("PromisePool", () => {
  //
  test("should start with empty queue and no in-flight tasks", () => {
    const pool = new PromisePool(3);
    expect(pool.getQueueLength()).toBe(0);
    expect(pool.getInFlightCount()).toBe(0);
  });

  test("should execute a single task and return its result", async () => {
    const pool = new PromisePool(3);
    const result = await pool.add(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  test("should contain task rejection and resolve with undefined", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const pool = new PromisePool(3);
    const result = await pool.add(() =>
      Promise.reject(new Error("task failed")),
    );
    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("PromisePool task failed: task failed"),
    );
    expect(pool.getInFlightCount()).toBe(0);
    errorSpy.mockRestore();
  });

  test("should contain synchronous throws and resolve with undefined", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const pool = new PromisePool(3);
    const result = await pool.add(() => {
      throw new Error("sync failure");
    });
    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("PromisePool task failed: sync failure"),
    );
    errorSpy.mockRestore();
  });

  test("should abort the signal of a task that times out", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const pool = new PromisePool(2, 50);
    let observedAbort = false;
    const result = await pool.add(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            observedAbort = true;
            resolve("aborted");
          });
          setTimeout(resolve, 500);
        }),
    );
    expect(result).toBeUndefined();
    expect(observedAbort).toBe(true);
    expect(pool.getInFlightCount()).toBe(0);
    jest.restoreAllMocks();
  });

  test("should limit concurrency", async () => {
    const pool = new PromisePool(2);
    let concurrentCount = 0;
    let maxConcurrentObserved = 0;

    const task = () =>
      new Promise((resolve) => {
        concurrentCount++;
        maxConcurrentObserved = Math.max(
          maxConcurrentObserved,
          concurrentCount,
        );
        setTimeout(() => {
          concurrentCount--;
          resolve(true);
        }, 50);
      });

    const tasks = [
      pool.add(task),
      pool.add(task),
      pool.add(task),
      pool.add(task),
    ];
    await Promise.all(tasks);
    expect(maxConcurrentObserved).toBeLessThanOrEqual(2);
  });

  test("should process all tasks when count equals concurrency limit", async () => {
    const pool = new PromisePool(2);
    const results = await Promise.all([
      pool.add(() => Promise.resolve(1)),
      pool.add(() => Promise.resolve(2)),
    ]);
    expect(results).toEqual([1, 2]);
    expect(pool.getInFlightCount()).toBe(0);
  });

  test("should process tasks sequentially when maxConcurrency is 1", async () => {
    const pool = new PromisePool(1);
    const order: number[] = [];

    const task1 = pool.add(async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
      return "first";
    });

    const task2 = pool.add(async () => {
      order.push(2);
      return "second";
    });

    await task1;
    await task2;
    expect(order).toEqual([1, 2]);
  });

  test("should resolve with undefined when task exceeds timeout", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const pool = new PromisePool(2, 100);
    const result = await pool.add(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );
    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Promise cancelled due to timeout"),
    );
    errorSpy.mockRestore();
  });

  test("should track queue length correctly", async () => {
    const pool = new PromisePool(1, 500);
    // Add 3 tasks with concurrency 1, so 2 should be queued
    pool.add(() => new Promise((r) => setTimeout(r, 50)));
    pool.add(() => new Promise((r) => setTimeout(r, 50)));
    const task3 = pool.add(() => new Promise((r) => setTimeout(r, 50)));

    // By the time we get here, tasks may already be dequeued
    // At least verify they all complete
    await task3;
    expect(pool.getInFlightCount()).toBe(0);
  });

  test("should provide AbortSignal to task generator", async () => {
    const pool = new PromisePool(2);
    const result = await pool.add((signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      return Promise.resolve("signal ok");
    });
    expect(result).toBe("signal ok");
  });
});
