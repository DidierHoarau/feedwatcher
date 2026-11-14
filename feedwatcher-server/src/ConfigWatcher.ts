import { readFileSync, watchFile } from "fs-extra";
import { Config } from "./Config";
import { OTelLogger } from "./OTelContext";

const logger = OTelLogger().createModuleLogger("ConfigWatcher");

let reloadTimer: NodeJS.Timeout = null;
let reloadChain: Promise<void> = Promise.resolve();

// ConfigBase.reload resets every field to its registered default before
// applying the config file, so a file that cannot be parsed would drop the
// values the server is running on: check the file first and keep the current
// configuration when it is present but invalid. Synchronous on purpose: an
// extra I/O await before config.reload() would not resolve while the debounced
// reload runs under fake timers.
function isConfigFileUsable(configFile: string): boolean {
  let content: string;
  try {
    content = readFileSync(configFile, "utf8");
  } catch (err) {
    return (err as { code?: string }).code === "ENOENT";
  }
  try {
    JSON.parse(content);
    return true;
  } catch (err) {
    logger.warn(
      `Config file ${configFile} cannot be parsed, keeping the current configuration`,
      err,
    );
    return false;
  }
}

export async function ConfigReloadSafely(config: Config): Promise<void> {
  if (!isConfigFileUsable(config.CONFIG_FILE)) {
    return;
  }
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
