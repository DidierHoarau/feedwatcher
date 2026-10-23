import { watchFile } from "fs-extra";
import { Config } from "./Config";
import { OTelLogger } from "./OTelContext";

const logger = OTelLogger().createModuleLogger("ConfigWatcher");

let reloadTimer: NodeJS.Timeout = null;
let reloadChain: Promise<void> = Promise.resolve();

export async function ConfigReloadSafely(config: Config): Promise<void> {
  try {
    await config.reload((msg) => logger.info(msg));
  } catch (err) {
    logger.error(`Config reload failed: ${config.CONFIG_FILE}`, err);
  }
}

export function ConfigWatcherScheduleReload(
  config: Config,
  debounceMs = 500,
): void {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    // Serialize reloads so a slow reload cannot be interleaved by the next
    // debounced one; a failed reload is already swallowed by the wrapper.
    reloadChain = reloadChain.then(() => ConfigReloadSafely(config));
  }, debounceMs);
  if (typeof reloadTimer.unref === "function") {
    reloadTimer.unref();
  }
}

export function ConfigWatcherStart(config: Config): void {
  watchFile(config.CONFIG_FILE, () => {
    logger.info(`Config updated: ${config.CONFIG_FILE}`);
    ConfigWatcherScheduleReload(config);
  });
}
