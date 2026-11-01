import { ConfigGet } from "../Config";
import { PromisePool } from "../utils-std-ts/PromisePool";

let pool: PromisePool = null;

// Shared pool for every outbound source fetch (scheduled cycles and manual
// "refresh all"), so PROCESSOR_CONCURRENCY bounds the work in both paths.
export function ProcessorsPoolGet(): PromisePool {
  if (!pool) {
    const config = ConfigGet();
    pool = new PromisePool(
      config.PROCESSOR_CONCURRENCY,
      config.SOURCE_FETCH_FREQUENCY / 6,
    );
  }
  return pool;
}

export function ProcessorsPoolResetForTests(): void {
  pool = null;
}
