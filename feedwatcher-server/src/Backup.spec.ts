import Database from "better-sqlite3";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { BackupCreate } from "./Backup";

let tempDirs: string[] = [];

beforeEach(() => {
  tempDirs = [];
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.removeSync(dir);
  }
  tempDirs = [];
});

function createTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-backup-"));
  tempDirs.push(dir);
  return dir;
}

function seedDatabase(dataDir: string): void {
  const db = new Database(path.join(dataDir, "database.db"));
  db.exec(
    "CREATE TABLE sources (id TEXT); INSERT INTO sources (id) VALUES ('source-1')",
  );
  db.close();
}

describe("BackupCreate", () => {
  test("creates a readable snapshot without touching the source database", () => {
    const dataDir = createTempDataDir();
    seedDatabase(dataDir);

    const backup = BackupCreate(dataDir);

    expect(fs.existsSync(backup.file)).toBe(true);
    expect(backup.file.startsWith(path.join(dataDir, "backups"))).toBe(true);
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dataDir, "database.db"))).toBe(true);

    const snapshot = new Database(backup.file, { readonly: true });
    const rows = snapshot.prepare("SELECT id FROM sources").all();
    snapshot.close();
    expect(rows).toEqual([{ id: "source-1" }]);
    expect(fs.statSync(backup.file).mode & 0o777).toBe(0o600);
  });

  test("keeps every snapshot when called twice", () => {
    const dataDir = createTempDataDir();
    seedDatabase(dataDir);

    const first = BackupCreate(dataDir);
    const second = BackupCreate(dataDir);

    expect(first.file).not.toBe(second.file);
    expect(fs.existsSync(first.file)).toBe(true);
    expect(fs.existsSync(second.file)).toBe(true);
    expect(fs.readdirSync(path.join(dataDir, "backups"))).toHaveLength(2);
  });

  test("fails clearly when the database is missing", () => {
    const dataDir = createTempDataDir();

    expect(() => BackupCreate(dataDir)).toThrow(/Database not found/);
  });
});
