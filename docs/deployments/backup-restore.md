# Backup and restore

FeedWatcher stores everything in the persistent data directory (`DATA_DIR`, `/data` in the container image). This page describes what to back up, how to take a consistent snapshot with the built-in maintenance command, and how to restore it. Nothing described here runs automatically, and none of the commands deletes data.

## What is persistent

- `/data/database.db` — the SQLite database: users, sources, items, labels, bookmarks, tags, settings, push subscriptions, search index and the auto-generated VAPID keys.
- `config.json` — configuration file when the operator mounts one (the image ships `/opt/app/feedwatcher/config.json`). Environment variables that override it (secrets included) are part of the deployment manifest, not the volume.
- Secrets and deployment configuration: `JWT_KEY`, `LLM_API_KEY`, `NEWSLETTER_AUTH_PASSWORD`, `PODCAST_INDEX_*`, overridden `VAPID_*`, OpenTelemetry collector credentials, and any other value set in the deployment.
- User processors are shipped with the image; keep them in source control instead of copying them from the container.

## Take a snapshot

The maintenance command uses SQLite `VACUUM INTO` on a read-only connection: it writes a consistent single-file snapshot to `$DATA_DIR/backups` (created on demand, file mode `0600`) while the application keeps serving. It never overwrites or deletes an existing snapshot.

```bash
# Docker
docker exec <container> node dist/Backup.js

# Kubernetes
kubectl -n <namespace> exec deploy/feedwatcher -- node dist/Backup.js

# Development checkout
cd feedwatcher-server
npm run build
npm run backup
```

The command prints the snapshot path and size. Copy it out of the container or volume:

```bash
docker cp <container>:/data/backups/feedwatcher-<timestamp>.db ./
kubectl -n <namespace> cp <pod>:/data/backups/feedwatcher-<timestamp>.db ./
```

The command is manual only: there is no schedule, no retention policy and no automatic deletion. If the database is missing it fails with `Database not found: <path>` and writes nothing.

## Restore

1. Stop the application (and any other writer) so a single process owns the database.
2. Preserve the current data directory, for example `mv /data /data.before-restore`.
3. Create a fresh `/data` and copy the snapshot to `/data/database.db`.
4. Remove stale SQLite sidecar files if the backup method left any: `database.db-wal`, `database.db-shm`, `database.db-journal`.
5. Restore `config.json` and the deployment secrets.
6. Start the application and check the startup logs (`Current DB Version`, migration lines), `GET /api/status`, then log in and verify sources, items and bookmarks.

Restore a snapshot into the same or a newer image version only: migrations are forward-only. To roll back code, restore a snapshot taken with the older version and run the older image.

## JSON export vs full backup

The JSON export (`GET /api/sources/import/export/json`, optionally `?includeItems=true`) is a **logical, portable** export of the caller's sources, labels, processors and (optionally) items for moving data between instances. It is not a backup: it omits users, password hashes, application settings, bookmarks, tags, push subscriptions and HTTP fetch validators. Use the SQLite snapshot above for a full-fidelity backup and restore.

## Security

Snapshots contain password hashes, private feed URLs (newsletter tokens) and auto-generated keys. Store them with the same care as the running data directory, and never commit them to a repository.
