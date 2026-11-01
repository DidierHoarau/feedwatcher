import Database from "better-sqlite3";
import * as fs from "fs-extra";
import * as path from "path";
import { ConfigGet } from "./Config";

// Consistent single-file snapshot of the live SQLite database. VACUUM INTO
// reads the source and writes a new file, so the running application is not
// blocked and existing data is never modified or deleted.
export function BackupCreate(dataDir: string): {
  file: string;
  sizeBytes: number;
} {
  const sourceFile = path.join(dataDir, "database.db");
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Database not found: ${sourceFile}`);
  }
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let targetFile = path.join(backupDir, `feedwatcher-${stamp}.db`);
  let suffix = 1;
  while (fs.existsSync(targetFile)) {
    targetFile = path.join(backupDir, `feedwatcher-${stamp}-${suffix}.db`);
    suffix++;
  }

  const db = new Database(sourceFile, {
    readonly: true,
    fileMustExist: true,
    timeout: 5000,
  });
  try {
    db.prepare("VACUUM INTO ?").run(targetFile);
  } finally {
    db.close();
  }

  fs.chmodSync(targetFile, 0o600);
  return { file: targetFile, sizeBytes: fs.statSync(targetFile).size };
}

async function backupMain(): Promise<void> {
  const config = ConfigGet();
  await config.reload((msg) => console.log(msg));
  if (config.DATABASE_TYPE !== "sqlite") {
    throw new Error(
      `Backup requires DATABASE_TYPE=sqlite (got ${config.DATABASE_TYPE})`,
    );
  }
  const backup = BackupCreate(config.DATA_DIR);
  console.log(`Backup created: ${backup.file} (${backup.sizeBytes} bytes)`);
}

if (require.main === module) {
  backupMain().catch((err) => {
    console.error(`Backup failed: ${err?.message ?? err}`);
    process.exit(1);
  });
}
