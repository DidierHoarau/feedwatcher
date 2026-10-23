import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Config } from "./Config";
import {
  ConfigReloadSafely,
  ConfigWatcherScheduleReload,
} from "./ConfigWatcher";

jest.mock("./OTelContext", () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    OTelLogger: () => ({ createModuleLogger: () => logger }),
    __configWatcherLogger: logger,
  };
});

const configWatcherLogger = (jest.requireMock("./OTelContext") as any)
  .__configWatcherLogger;

let tempDirs: string[] = [];

function newTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-config-"));
  tempDirs.push(dir);
  return dir;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

afterEach(() => {
  jest.useRealTimers();
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

describe("ConfigReloadSafely", () => {
  test("applies a valid configuration file", async () => {
    const configFile = path.join(newTempDir(), "config.json");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ SOURCE_ERROR_THRESHOLD: 9 }),
    );
    const config = new Config();
    config.CONFIG_FILE = configFile;

    await ConfigReloadSafely(config);

    expect(config.SOURCE_ERROR_THRESHOLD).toBe(9);
  });

  test("an invalid configuration file leaves the previous values and resolves", async () => {
    const configFile = path.join(newTempDir(), "config.json");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ SOURCE_ERROR_THRESHOLD: 9 }),
    );
    const config = new Config();
    config.CONFIG_FILE = configFile;
    await ConfigReloadSafely(config);
    expect(config.SOURCE_ERROR_THRESHOLD).toBe(9);

    fs.writeFileSync(configFile, "{ this is not json");

    await expect(ConfigReloadSafely(config)).resolves.toBeUndefined();
    expect(config.SOURCE_ERROR_THRESHOLD).toBe(9);
  });

  test("a rejecting reload is swallowed and logged", async () => {
    const config: any = {
      CONFIG_FILE: "broken.json",
      reload: jest.fn().mockRejectedValue(new Error("reload exploded")),
    };

    await expect(ConfigReloadSafely(config)).resolves.toBeUndefined();

    expect(config.reload).toHaveBeenCalledTimes(1);
    expect(configWatcherLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Config reload failed"),
      expect.any(Error),
    );
  });
});

describe("ConfigWatcherScheduleReload", () => {
  test("several triggers inside the debounce window cause one reload", async () => {
    jest.useFakeTimers();
    const config: any = {
      CONFIG_FILE: "config.json",
      reload: jest.fn(async () => undefined),
    };

    ConfigWatcherScheduleReload(config, 500);
    jest.advanceTimersByTime(100);
    ConfigWatcherScheduleReload(config, 500);
    jest.advanceTimersByTime(100);
    ConfigWatcherScheduleReload(config, 500);

    expect(config.reload).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    await flushMicrotasks();

    expect(config.reload).toHaveBeenCalledTimes(1);
  });
});
