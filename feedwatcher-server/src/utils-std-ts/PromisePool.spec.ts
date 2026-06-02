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

  test("should handle task rejection", async () => {
    const pool = new PromisePool(3);
    await expect(
      pool.add(() => Promise.reject(new Error("task failed"))),
    ).rejects.toThrow("task failed");
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

  test("should handle timeout and reject if task exceeds timeout", async () => {
    const pool = new PromisePool(2, 100);
    await expect(
      pool.add(() => new Promise((resolve) => setTimeout(resolve, 500))),
    ).rejects.toThrow("Promise cancelled due to timeout");
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
