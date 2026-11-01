# FeedWatcher

FeedWatcher is a web application to follow online resources like RSS feeds.

![](docs/images/screenshot_list.png?raw=true)

# Philosophy

This project is an open source application published on GitHub.

The preferred deployment format of the application is a container (e.g., Docker and/or Kubernetes). The application is published as a single container image that contains both the server and web UI of the application. No external database is needed, just an external volume. The goal is to have an application as self-contained, light, and fast to deploy as possible.

The main use case for the application is to subscribe to RSS feeds. But because support for RSS is not universal, the application is designed to be extendable to other kinds of resources. The idea is to be able to add modules (called "processors" in the application). The repository ships some default modules by default, but during deployment you can add your own private modules and the application will make use of them automatically. The modules are only required to be put in a specific folder and follow some basic standards.

# Deployment

FeedWatcher is designed to be deployed as a container.

- The Docker image is: `didierhoarau/feedwatcher` [https://hub.docker.com/r/didierhoarau/feedwatcher](https://hub.docker.com/r/didierhoarau/feedwatcher)
- This image exposes port `8080`
- The volume is located at `/data`

## Docker

You can, for example, run the following command to run FeedWatcher in Docker:

```bash
mkdir -p data
docker run --name feedwatcher -p 8080:8080 -v "$(pwd)/data:/data" -d didierhoarau/feedwatcher
```

## Kubernetes

The following manifest can be used to deploy in Kubernetes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feedwatcher
  labels:
    app: feedwatcher
spec:
  replicas: 1
  selector:
    matchLabels:
      app: feedwatcher
  template:
    metadata:
      labels:
        app: feedwatcher
    spec:
      containers:
        - image: feedwatcher
          name: feedwatcher
          resources:
            limits:
              memory: 500Mi
              cpu: 1
            requests:
              memory: 200Mi
              cpu: 100m
          volumeMounts:
            - mountPath: /data
              name: pod-volume
          imagePullPolicy: Always
          readinessProbe:
            httpGet:
              path: /api/status
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
      volumes:
        - name: pod-volume
          persistentVolumeClaim:
            claimName: feedwatcher
---
apiVersion: v1
kind: Service
metadata:
  name: feedwatcher
spec:
  ports:
    - name: tcp
      port: 8080
      targetPort: 8080
  selector:
    app: feedwatcher
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: feedwatcher
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

Check the [docs/deployments](docs/deployments) for more examples of deployments.

# Configuration

Configuration values can be set via environment variables or through the `config.json` file. Environment variables take precedence over config file values, which take precedence over defaults.

Adding a source supports pasting any site URL: FeedWatcher discovers the site's feeds (`<link rel="alternate">` tags, or the URL itself when it is already a feed), shows a preview of the latest items and lets the user confirm the subscription.

> **SSRF protection:** source URLs, URL previews and article fetches are validated before connecting: only `http`/`https` URLs are accepted, hostnames must resolve to public addresses, every redirect is revalidated, and the connection is pinned to the validated IP. Loopback, link-local, private, metadata and other special-use ranges are rejected. Self-hosted and home-lab installs that intentionally follow feeds on their local network can set `SOURCE_ALLOW_PRIVATE_NETWORK=true`; this disables the address restrictions and should stay `false` on shared or public instances. The setting is read at startup: restart the application after changing it.

## Database

FeedWatcher supports **SQLite only** (`DATABASE_TYPE=sqlite`, the default). The schema relies on SQLite FTS5 virtual tables and triggers for full-text search (`feedwatcher-server/sql/init-0008.sql`), SQLite `MATCH`/`bm25` ranking in item search and `GLOB` matching in rules; the shipped migrations do not work on PostgreSQL, and the PostgreSQL code path in the item writer is not supported.

The scheduler gauges are served from in-memory counters: they are updated as items change, reconciled at startup and after the orphan cleanup, and the orphan cleanup runs at most once every 24 hours (it used to run every cycle).

### Data export (JSON)

Besides the OPML import/export, the server can export the caller's sources and items as JSON. The `Settings → Import / Export` page offers two JSON buttons, and the endpoint can also be called directly:

```bash
curl -H "Authorization: Bearer <token>" \
  '<server>/api/sources/import/export/json?includeItems=true'
```

- `GET /api/sources/import/export/json` — sources only.
- `GET /api/sources/import/export/json?includeItems=true` (or `1`) — sources and their items.
- Ownership is enforced: only the authenticated user's sources and items are exported.
- The response is streamed in batches (500 items per query), so memory stays bounded; an interrupted download yields truncated, invalid JSON. The settings-page download buffers the whole response in the browser, so use the `curl` call above for very large libraries.
- No importer is provided for the JSON format.

Schema:

```json
{
  "format": "feedwatcher-sources",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "sources": [
    {
      "id": "…",
      "name": "…",
      "info": { "url": "…", "processorPath": "…", "provider": "…" },
      "labels": ["…"]
    }
  ],
  "items": [
    {
      "id": "…", "sourceId": "…", "title": "…", "content": "…",
      "url": "…", "status": "read|unread", "datePublished": "ISO",
      "thumbnail": null, "info": {}
    }
  ]
}
```

`items` is absent unless requested. `info` is the stored source/item metadata (`info.processorPath` is environment-specific). The export is a logical snapshot, not a database backup: it omits users, passwords, settings, bookmarks, tags, push subscriptions and HTTP fetch validators. Export files contain private feed URLs and tokens and must be handled as sensitive data.

### Backup and restore

The maintenance command takes a consistent snapshot of the live SQLite database with `VACUUM INTO` and writes it to `$DATA_DIR/backups`; it never runs automatically and never deletes data. In the container image:

```bash
docker exec <container> node dist/Backup.js
kubectl -n <namespace> exec deploy/feedwatcher -- node dist/Backup.js
```

See [docs/deployments/backup-restore.md](docs/deployments/backup-restore.md) for what is persistent, how to restore and the security notes.

## Bookmarks

Bookmarks are stored per user and item. Each user can bookmark an item once: bookmarks have a unique `(itemId, userId)` constraint, and repeated requests are idempotent (adding an existing bookmark succeeds without creating a duplicate).

- `PUT /api/lists/items` with `{ "itemId": "…" }` — add a bookmark (owner-only; returns `200 {}`).
- `DELETE /api/lists/items/:itemId` — remove the caller's bookmark (`204`).
- `GET /api/lists/items/:itemId` — return the bookmarked item.

`listName` is **not** part of this contract: it was removed in 1.78.0 and is ignored when sent. Named lists are not supported.

## General

| Variable                 | Description                                     | Default             |
| ------------------------ | ----------------------------------------------- | ------------------- |
| `JWT_VALIDITY_DURATION`        | JWT token validity duration in seconds          | `8035200` (93 days) |
| `SOURCE_FETCH_FREQUENCY`       | Interval between source fetches in milliseconds | `1800000` (30 min)  |
| `PROCESSOR_CONCURRENCY`        | Number of concurrent source fetches             | `2`                 |
| `SOURCE_ALLOW_PRIVATE_NETWORK` | Allow source URLs and URL previews to resolve private/special-use IP ranges (self-hosted/home-lab). Disables SSRF protection; keep `false` on shared or public instances | `false` |

### Source Health

Sources that need attention are flagged in the source list: a source is marked **stale** when it hasn't published new items for a long time, **failing** when its fetch keeps erroring, and **disabled** when the scheduler stopped fetching it automatically (see below). Failing sources are retried with an exponential backoff (up to the maximum) to avoid hitting the rate limits of the target sites. They are also listed in the "Sources needing attention" section of the home page (above the list of URL types), each entry linking to the source's items on the sources page.

When a source keeps failing (typically a feed that is gone for good), retrying it every day only generates errors: after `SOURCE_DISABLE_THRESHOLD` consecutive fetch errors the source is **automatically disabled** and is no longer picked up by the scheduler. Disabled sources are reported with their reason in the "Sources needing attention" section and on the source edit page, where a manual fetch resumes automatic fetching as soon as it succeeds (a successful fetch always resets the error counters). Set `SOURCE_DISABLE_THRESHOLD` to `0` to never disable a source automatically.

Rate-limited sources are treated with extra care: when a `429` or `503` response carries a `Retry-After` header, the next fetch is not attempted before that delay (capped at `SOURCE_BACKOFF_MAX`).

| Variable                    | Description                                                                                | Default                  |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| `SOURCE_STALE_THRESHOLD`    | Time without new items after which a source is marked stale, in milliseconds                | `31536000000` (365 days) |
| `SOURCE_ERROR_THRESHOLD`    | Number of consecutive fetch errors after which a source is marked failing                   | `5`                      |
| `SOURCE_BACKOFF_MAX`        | Maximum backoff between fetches for failing sources, in milliseconds                        | `86400000` (24 hours)    |
| `SOURCE_DISABLE_THRESHOLD`  | Number of consecutive fetch errors after which a source is disabled (`0` to never disable)  | `10`                     |

### YouTube

Some server networks cannot reach YouTube's RSS feed endpoint (`youtube.com/feeds/videos.xml`), which makes channel sources fail to fetch. Alternate feed endpoints can be configured with `FEEDWATCHER_YOUTUBE_FEED_URLS`: a comma-separated list of URL templates tried in order, each containing a `{channelId}` placeholder that is replaced with the channel ID. The first endpoint that answers wins; when the variable is unset, the default YouTube endpoint is used.

| Variable                         | Description                                             | Default                                                        |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `FEEDWATCHER_YOUTUBE_FEED_URLS`  | Comma-separated YouTube feed URL templates              | `https://www.youtube.com/feeds/videos.xml?channel_id={channelId}` |

Example for an Invidious-style mirror:

```
FEEDWATCHER_YOUTUBE_FEED_URLS=https://www.youtube.com/feeds/videos.xml?channel_id={channelId},https://<invidious-host>/feed/channel/{channelId}
```

## User Accounts

The first account is created from the login page while the user base is empty — this is the only account that can be created through the API (`POST /api/users`), as a bootstrap step. Once a user exists, account creation through the API is disabled (`403`); additional accounts are created by the operator directly in the database (`users` table; passwords are stored as bcrypt hashes).

## Podcast Search

The application supports searching for podcasts via the [Podcast Index](https://podcastindex.org/) API. This feature is enabled when both `PODCAST_INDEX_API_KEY` and `PODCAST_INDEX_API_SECRET` are set. When not configured, the "Search Podcasts" option is hidden from the UI.

| Variable                   | Description              | Default |
| -------------------------- | ------------------------ | ------- |
| `PODCAST_INDEX_API_KEY`    | Podcast Index API key    |         |
| `PODCAST_INDEX_API_SECRET` | Podcast Index API secret |         |

## Newsletter Integration

FeedWatcher can list the newsletters offered by a [feedwatcher-newsletter](../feedwatcher-newsletter) service (an IMAP → RSS bridge), show which ones are already sources and subscribe to a selection in one idempotent action. The integration is enabled when `NEWSLETTER_URL` is set; the UI then shows a **Newsletters** mode on the New Source page and a dedicated `/sources/newsletter` page.

| Variable                    | Description                                                       | Default       |
| --------------------------- | ----------------------------------------------------------------- | ------------- |
| `NEWSLETTER_URL`            | Base URL of the newsletter service, ideally the internal service URL (e.g. `http://feedwatcher-newsletter.feedwatcher.svc.cluster.local:8080`) | (disabled)    |
| `NEWSLETTER_AUTH_USERNAME`  | HTTP Basic username used when the newsletter requires a password  | `feedwatcher` |
| `NEWSLETTER_AUTH_PASSWORD`  | HTTP Basic password; when empty no `Authorization` header is sent |               |

The server reads the newsletter's versioned catalogue at `GET <NEWSLETTER_URL>/api/feeds` (falling back to the legacy `/rss/` JSON listing when the catalogue is unavailable). `GET /api/sources/newsletter` returns every offered feed with its state — `added`, `available` or `ignored` — plus `itemCount`, `latestDate` and, for added feeds, the existing source id. `POST /api/sources/newsletter/subscribe` with `{ "feedIds": [...], "label": "Newsletters" }` resolves each feed id to its current URL server-side and creates the sources idempotently; repeating the request reports them as `existing`. Feed ids the user ignored are skipped unless the request sets `"includeIgnored": true`.

Matching is read-only: existing sources carrying `info.provider = "feedwatcher-newsletter"` and `info.providerFeedId` are reported as added, and legacy subscriptions using `/rss/<feedId>` or `/rss/<feedId>.<token>` URLs are matched by feed id (never by full URL, which changes when private-URL tokens rotate). Nothing is ever subscribed automatically — every source is user-selected.

Per-user "not interested" state is stored in the user's settings (`newsletter.ignoredFeedIds`) through `PUT /api/users/settings`; ignored feeds stay listed so they can be restored. The catalogue is cached in memory for 30 seconds and revalidated with `ETag`/`Last-Modified`; `/api/status` only exposes a boolean `newsletterEnabled` (never the internal URL). Private feed tokens are part of the stored source URL: they appear in the source editor but are stripped from logs and stored fetch errors.

### Trusted internal access

FeedWatcher reaches the newsletter over `NEWSLETTER_URL`; when that URL is the in-cluster service, only that exact origin — plus the newsletter's advertised feed-URL origin when the catalogue confirms it — may resolve to a private or reserved address. Every other host is still blocked by the SSRF guard, and `SOURCE_ALLOW_PRIVATE_NETWORK` stays `false`. Trusted fetches keep DNS pinning, cap redirects (same origin only), response size and time. The same-namespace Kubernetes `NetworkPolicy` already permits pod-to-pod traffic.

Newsletter Basic auth (`NEWSLETTER_AUTH_USERNAME`/`NEWSLETTER_AUTH_PASSWORD`) is sent to the catalogue request and only to feeds whose source carries the `feedwatcher-newsletter` provider metadata; no other source receives the header. Credentials live in configuration/secrets, never in the database or in source URLs.

### Provider metadata and URL repair

Provider sources store the advertised catalogue URL in `info.url`/`info.providerUrl`; the fetch itself is rewritten to `NEWSLETTER_URL`, so traffic stays in-cluster while the advertised URL remains the identity used for repair. Legacy newsletter sources are backfilled with `provider`, `providerFeedId` and `providerUrl` at startup (idempotent) and again during a repair; URLs outside a verified newsletter origin are never tagged.

Private tokens rotate: when the catalogue advertises a new URL for a known `providerFeedId`, the source is rewritten in place, keeping its id, items, labels and user state — no duplicate is created. A source whose feed disappeared from the catalogue is reported as **orphaned**, never deleted.

- `POST /api/sources/newsletter/repair` with `{ "dryRun": true }` (the default) reports what would change; `{ "dryRun": false }` applies the repairs. The response contains `dryRun`, `catalogueAvailable`, `backfilled`, `repaired`, `orphaned`, `unchanged` and `unverified`, and never includes URLs or tokens.
- The scheduler runs the same repair before each fetch cycle, with a 15-minute backoff after a catalogue failure. A source without provider metadata is never rewritten.
- The `/sources/newsletter` page shows **Check sources** and **Repair now** actions with the repairable and orphaned lists.

### OPML import

Importing a newsletter OPML matches existing sources by stable feed id as well as by normalized URL, so a feed subscribed as `/rss/<feedId>` is not duplicated when the list uses `/rss/<feedId>.<token>` (and vice versa). Other feeds keep normalized-URL matching.

### Fallback order

1. Internal `NEWSLETTER_URL` (in-cluster service URL) with the scoped allowlist above.
2. Public `NEWSLETTER_URL` in environments without internal access.
3. OPML or manual URL subscription.

Set the newsletter's `PUBLIC_URL` so advertised feed URLs (and therefore their origins) are stable and verifiable.

### Deployment note (GitOps)

Set `NEWSLETTER_URL` to the internal service URL and `NEWSLETTER_AUTH_USERNAME`/`NEWSLETTER_AUTH_PASSWORD` from the existing secret; keep `SOURCE_ALLOW_PRIVATE_NETWORK=false`. Enable the newsletter's `AUTH_PASSWORD` only after FeedWatcher has the matching credentials, otherwise the catalogue returns 401.

## LLM (News Summary)

The application can generate daily news summaries using any OpenAI-compatible chat completions API. Summary generation is enabled when `LLM_API_KEY` is set.

| Variable                | Description                                     | Default                                     |
| ----------------------- | ----------------------------------------------- | ------------------------------------------- |
| `LLM_API_KEY`           | API key for the LLM provider                    |                                             |
| `LLM_API_URL`           | Chat completions endpoint URL                   | `https://api.deepseek.com/chat/completions` |
| `LLM_MODEL`             | Model name to use                               | `deepseek-chat`                             |
| `SUMMARY_SCHEDULE_CRON` | Cron expression for summary schedule (UTC time) | `0 0 * * *` (daily at midnight)             |

### Notifications (Web Push)

Each user can opt in to Web Push notifications in **Settings → Me**: a push when the daily digest is published, pushes for new items (all sources or selected labels only), and a custom summary prompt replacing the default one. The PWA shows an unread badge on browsers supporting the Badging API.

VAPID keys are auto-generated on first boot and persisted in the database, so the feature works with no configuration. Operators can override them with environment variables:

| Variable             | Description                        | Default                         |
| -------------------- | ---------------------------------- | ------------------------------- |
| `VAPID_PUBLIC_KEY`   | Web Push VAPID public key          | auto-generated on first boot    |
| `VAPID_PRIVATE_KEY`  | Web Push VAPID private key         | auto-generated on first boot    |
| `VAPID_SUBJECT`      | Contact info sent to push services | `mailto:feedwatcher@localhost`  |

Notes:
- Digest pushes follow `SUMMARY_SCHEDULE_CRON`; new-item pushes follow the fetch cadence (`SOURCE_FETCH_FREQUENCY`), batched at most once per cycle per user.
- Push requires HTTPS and browser support; unsupported setups simply see the feature disabled in Settings.

## OpenTelemetry

| Variable                                                  | Description                                 | Default |
| --------------------------------------------------------- | ------------------------------------------- | ------- |
| `OPENTELEMETRY_COLLECTOR_HTTP_TRACES`                     | OTel collector URL for traces               |         |
| `OPENTELEMETRY_COLLECTOR_HTTP_METRICS`                    | OTel collector URL for metrics              |         |
| `OPENTELEMETRY_COLLECTOR_HTTP_LOGS`                       | OTel collector URL for logs                 |         |
| `OPENTELEMETRY_COLLECTOR_EXPORT_LOGS_INTERVAL_SECONDS`    | Log export interval in seconds              | `60`    |
| `OPENTELEMETRY_COLLECTOR_EXPORT_METRICS_INTERVAL_SECONDS` | Metrics export interval in seconds          | `60`    |
| `OPENTELEMETRY_COLLECTOR_AWS`                             | Enable AWS OTel collector                   | `false` |
| `OPENTELEMETRY_COLLECT_AUTHORIZATION_HEADER`              | Authorization header for the OTel collector |         |

Gauges:

- `feeds.items.queue{item}` and `feeds.items.total{item}` are **process-wide** (all users), not per user.
- `bookmarked` counts **distinct** items saved by at least one user: bookmark rows are unique per user and item, so an item bookmarked by two users counts once.
- Values are eventually consistent: per-mutation updates appear within the 2 s coalescing window, and a full reconciliation runs at startup and after the daily orphan cleanup.
- `feeds.fetch.queue{status}` reflects the shared processor pool used by scheduled fetches and manual "refresh all".

# Development

If you want to extend the application with your own Processors: [docs/processors](docs/processors)
