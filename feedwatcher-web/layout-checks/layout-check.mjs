#!/usr/bin/env node
/**
 * Layout invariant checks for the FeedWatcher item dialog and list pages.
 *
 * Boots the real feedwatcher-server (tsx) with the production web build
 * (feedwatcher-web/.output/public — run `npm run generate` first), seeds a
 * throwaway SQLite database, then drives the app with puppeteer and asserts
 * layout invariants — not golden screenshots — across viewports, dialog
 * states and degraded-DOM mutations (e.g. a dialog header that fails to
 * generate a box, which historically stretched the footer buttons
 * grotesquely). The list-page state additionally asserts no horizontal
 * overflow, item actions that do not cover the title text, a symmetric gap
 * above and below the search input in the item actions bar, and a single-line
 * actions bar while the advanced filters are closed. It also opens those
 * advanced filters and asserts every labeled field stays inside the bar, keeps
 * a readable width on mobile, shares one control height and keeps the From/To
 * date bounds side by side on one row.
 *
 * The sources-tree state seeds a small label hierarchy and asserts the tree
 * stays on one indentation grid: each row is padded by exactly depth * one
 * step (the root has no indentation), its content starts at that padding edge
 * with nothing reserved before the icon, every row at a depth — label or
 * source, with or without a caret — shares one icon/name column, consecutive
 * levels step in by the same non-zero amount (so the first level of children
 * is indented too), and the tree never overflows its column horizontally.
 *
 * The new-source-page and newsletter-page states cover the scrollable pages:
 * `/sources/new` must keep its header and mode tabs fixed while only the
 * active mode scrolls (add-by-url, 25 podcast search results, 25 newsletter
 * feeds), and `/sources/newsletter` must scroll down to the source-health
 * panel. The edit-source-page state covers `/sources/:sourceId`: a long health
 * header plus the URL finder expanded to 25 podcast search results must scroll
 * down to the Labels field and the Update/Delete buttons. They run on a
 * dedicated page with request interception mocking `/api/status`,
 * `/api/sources/search`,
 * `/api/sources/newsletter` and the edited source + labels; the service
 * worker is bypassed there because it serves the unauthenticated `/api/status`
 * stale-while-revalidate and would hide the mocked flags.
 *
 * Prerequisites:
 *   - feedwatcher-server: npm ci
 *   - feedwatcher-web:    npm ci && npm run generate
 *
 * Exits non-zero (with printed measurements and screenshots in a temp dir)
 * if any invariant is violated.
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import puppeteer from "puppeteer";

const CHECKS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(CHECKS_DIR, "..");
const ROOT_DIR = path.resolve(WEB_DIR, "..");
const SERVER_DIR = path.join(ROOT_DIR, "feedwatcher-server");
const WEB_BUILD = path.join(WEB_DIR, ".output", "public");
const SERVER_WEB = path.join(SERVER_DIR, "web");
const SERVER_WEB_BACKUP = `${SERVER_WEB}.layout-check-backup`;

const WAIT_TIMEOUT_MS = 60_000;
const SERVER_TIMEOUT_MS = 180_000;

const VIEWPORTS = [
  { name: "360x740", width: 360, height: 740, isMobile: true },
  { name: "412x915", width: 412, height: 915, isMobile: true },
  { name: "1280x800", width: 1280, height: 800, isMobile: false },
];

// Button sets the template must render for each dialog state. The reader
// state's exact third button depends on whether the extraction succeeded
// (Show Summary) or failed (Reader view reappears); both are valid.
const STATES = [
  {
    name: "summary",
    itemKey: "plain",
    clickButton: null,
    buttons: ["Close", "Open", "Reader view", "Load Full"],
  },
  {
    name: "reader",
    itemKey: "plain",
    clickButton: "Reader view",
    buttonsAlternatives: [
      // Extraction succeeded: Reader view is replaced by Show Summary.
      ["Close", "Open", "Load Full", "Show Summary"],
      // Extraction failed: Show Summary is unavailable, Reader view returns.
      ["Close", "Open", "Load Full", "Reader view"],
    ],
  },
  {
    name: "full-source",
    itemKey: "long",
    clickButton: "Load Full",
    buttons: ["Close", "Open", "Show Summary"],
  },
  {
    name: "podcast",
    itemKey: "podcast",
    clickButton: null,
    buttons: ["Close", "Play Episode", "Open", "Reader view", "Load Full"],
  },
];

// Synthetic API payloads for the new-source-page / newsletter-page states.
// 25 rows exceed every checked viewport height, so each list must scroll.
const SEARCH_FEEDS = Array.from({ length: 25 }, (_, i) => ({
  title: `Synthetic Podcast ${i + 1}`,
  url: `https://example.com/podcast-${i + 1}.xml`,
  description: "Synthetic search result used by the layout check.",
  author: `Author ${i + 1}`,
  image: "",
}));

const NEWSLETTER_FEEDS = Array.from({ length: 25 }, (_, i) => ({
  providerFeedId: `synthetic-feed-${i + 1}`,
  title: `Synthetic Newsletter ${i + 1}`,
  senderName: `Sender ${i + 1}`,
  senderEmail: `sender${i + 1}@example.com`,
  itemCount: 10 + i,
  latestDate: "2026-10-01T00:00:00.000Z",
  state: "available",
}));

// Edited source: a long URL plus the health block and the URL finder with 25
// podcast results push the Labels field and the Update/Delete buttons below
// the fold at every checked viewport.
const EDIT_SOURCE_ID = "synthetic-edit-source";
const EDIT_SOURCE = {
  id: EDIT_SOURCE_ID,
  name: "Synthetic newsletter source",
  info: {
    url: "http://feedwatcher-newsletter:8080/rss/synthetic-newsletter-feed-with-a-rather-long-name",
    provider: "feedwatcher-newsletter",
    providerFeedId: "synthetic-feed-1",
    fetchErrorCount: 9,
    lastFetchError: "No processor found for this source",
    lastFetchErrorDate: "2026-10-27T19:20:39.000Z",
    dateFetched: "2026-10-23T10:15:36.000Z",
    lastItemDate: "2026-08-18T12:47:27.000Z",
  },
  health: "failing",
};

const EDIT_SOURCE_LABELS = {
  labels: [{ name: "newsletters" }, { name: "daily" }],
};

const failures = [];

function fail(caseName, message) {
  failures.push({ caseName, message });
  console.error(`    FAIL ${caseName}: ${message}`);
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(condition, { timeoutMs, what }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
}

async function restoreServerWebDir() {
  if (fs.existsSync(SERVER_WEB_BACKUP)) {
    await fsp.rm(SERVER_WEB, { recursive: true, force: true });
    await fsp.rename(SERVER_WEB_BACKUP, SERVER_WEB);
  }
}

async function main() {
  if (!fs.existsSync(WEB_BUILD)) {
    console.error(
      `Missing web build at ${WEB_BUILD}. Run \`npm run generate\` in feedwatcher-web first.`,
    );
    process.exit(2);
  }

  await restoreServerWebDir();

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "feedwatcher-layout-"));
  const dataDir = path.join(tmpDir, "data");
  const configPath = path.join(tmpDir, "config.json");
  const serverLogPath = path.join(tmpDir, "server.log");
  await fsp.mkdir(dataDir, { recursive: true });

  let server;
  let browser;
  let db;
  try {
    // Swap the placeholder web dir for the production build (mirrors the
    // Dockerfile); the original is restored in `finally`.
    await fsp.rename(SERVER_WEB, SERVER_WEB_BACKUP);
    await fsp.mkdir(SERVER_WEB, { recursive: true });
    await fsp.cp(WEB_BUILD, SERVER_WEB, { recursive: true });

    const port = await getFreePort();
    const base = `http://127.0.0.1:${port}`;
    const serverConfig = JSON.parse(
      await fsp.readFile(path.join(SERVER_DIR, "config.json"), "utf8"),
    );
    serverConfig.API_PORT = port;
    serverConfig.DATA_DIR = dataDir;
    await fsp.writeFile(configPath, JSON.stringify(serverConfig, null, 2));

    const serverLog = fs.openSync(serverLogPath, "a");
    server = spawn("npx", ["tsx", "./src/App.ts"], {
      cwd: SERVER_DIR,
      env: { ...process.env, CONFIG_FILE: configPath },
      stdio: ["ignore", serverLog, serverLog],
    });

    console.log(`Starting feedwatcher-server on ${base} (log: ${serverLogPath})`);
    await waitFor(async () => {
      try {
        const res = await fetch(`${base}/api/status`);
        return res.ok;
      } catch {
        return false;
      }
    }, { timeoutMs: SERVER_TIMEOUT_MS, what: "feedwatcher-server /api/status" });
    console.log("Server is up.");

    // Bootstrap user + session token (user table is empty on a fresh DATA_DIR).
    const password = crypto.randomUUID();
    const registerRes = await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "layout-check", password }),
    });
    if (!registerRes.ok) {
      throw new Error(`User registration failed: ${registerRes.status}`);
    }
    const sessionRes = await fetch(`${base}/api/users/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "layout-check", password }),
    });
    if (!sessionRes.ok) {
      throw new Error(`Session creation failed: ${sessionRes.status}`);
    }
    const { token } = await sessionRes.json();
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    db = new DatabaseSync(path.join(dataDir, "database.db"));
    const userId = db
      .prepare("SELECT id FROM users WHERE name = ?")
      .get("layout-check")?.id;
    if (!userId) {
      throw new Error("Seeded user not found in database");
    }

    const seedItems = seedData(userId);
    await seedSourcesAndItems(db, seedItems);
    seedLabelTree(db, userId);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT_MS);
    await page.evaluateOnNewDocument((authToken) => {
      try {
        localStorage.setItem("auth_token", authToken);
        localStorage.setItem("UI_THEME", "dark");
        localStorage.setItem("open_details_mode", "dialog-summary");
      } catch {
        // Sandboxed iframes cannot touch localStorage; ignore.
      }
    }, token);

    // Dedicated page for the scrollable-page states: mocked API responses
    // need request interception, and the service worker is bypassed first
    // (it serves /api/status stale-while-revalidate and would hide the mocks).
    const newSourcePage = await browser.newPage();
    newSourcePage.setDefaultTimeout(WAIT_TIMEOUT_MS);
    await newSourcePage.setBypassServiceWorker(true);
    await newSourcePage.setRequestInterception(true);
    await newSourcePage.evaluateOnNewDocument((authToken) => {
      try {
        localStorage.setItem("auth_token", authToken);
      } catch {
        // Sandboxed iframes cannot touch localStorage; ignore.
      }
    }, token);
    newSourcePage.on("request", (request) => {
      try {
        const pathname = new URL(request.url()).pathname;
        const respond = (body) =>
          request.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (pathname === "/api/status") {
          return respond({
            started: true,
            podcastSearchEnabled: true,
            newsletterEnabled: true,
            notificationsEnabled: false,
          });
        }
        if (pathname === "/api/sources/search") {
          return respond({ feeds: SEARCH_FEEDS });
        }
        if (pathname === "/api/sources/newsletter") {
          return respond({ enabled: true, feeds: NEWSLETTER_FEEDS });
        }
        if (pathname === `/api/sources/${EDIT_SOURCE_ID}/labels`) {
          return respond(EDIT_SOURCE_LABELS);
        }
        if (pathname === `/api/sources/${EDIT_SOURCE_ID}`) {
          return respond(EDIT_SOURCE);
        }
        return request.continue();
      } catch (error) {
        console.error(`    request interception error: ${error}`);
        request.continue().catch(() => {});
      }
    });

    for (const viewport of VIEWPORTS) {
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
      });
      await runListPageState(page, base, authHeaders, seedItems, viewport, tmpDir);
      await runSourceTreeState(page, base, viewport, tmpDir);
      for (const state of STATES) {
        await runState(page, base, authHeaders, seedItems, state, viewport, tmpDir);
      }

      await newSourcePage.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
      });
      await runNewSourceStates(newSourcePage, base, viewport, tmpDir);
      await runNewsletterPageState(newSourcePage, base, viewport, tmpDir);
      await runEditSourcePageState(newSourcePage, base, viewport, tmpDir);
    }
  } catch (error) {
    fail("setup", error?.stack || String(error));
    await printServerLogTail(serverLogPath);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (db) {
      db.close();
    }
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 2000));
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }
    await restoreServerWebDir();
    if (failures.length === 0 && !process.env.LAYOUT_CHECK_KEEP) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    } else {
      console.error(`Artifacts kept in ${tmpDir}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} layout invariant failure(s):`);
    for (const { caseName, message } of failures) {
      console.error(`  - ${caseName}: ${message}`);
    }
    process.exit(1);
  }
  console.log("\nAll layout invariant checks passed.");
}

function seedData(userId) {
  return {
    sourceId: crypto.randomUUID(),
    userId,
    items: {
      plain: {
        id: crypto.randomUUID(),
        title: "Layout check — plain article",
        content:
          "<p>Short summary content for the layout check.</p>".repeat(3),
        url: "https://example.com/",
        info: {},
      },
      long: {
        id: crypto.randomUUID(),
        title: "Layout check — long article",
        content: Array.from(
          { length: 30 },
          (_, i) => `<p>Paragraph ${i + 1} of the long summary content.</p>`,
        ).join(""),
        url: "https://example.com/",
        info: {},
      },
      podcast: {
        id: crypto.randomUUID(),
        title: "Layout check — podcast episode",
        content: "<p>Podcast episode summary content.</p>",
        url: "https://example.com/episode",
        info: { isPodcast: true, audioUrl: "https://example.com/audio.mp3" },
      },
    },
  };
}

function seedSourcesAndItems(db, seed) {
  db.prepare(
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
  ).run(
    seed.sourceId,
    seed.userId,
    "Layout check source",
    JSON.stringify({ url: "https://example.com/feed", autoDisabled: true }),
  );
  const insertItem = db.prepare(
    `INSERT INTO sources_items
       (id, sourceId, title, content, url, status, datePublished, info, thumbnail)
     VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, '')`,
  );
  const datePublished = new Date().toISOString();
  for (const item of Object.values(seed.items)) {
    insertItem.run(
      item.id,
      seed.sourceId,
      item.title,
      item.content,
      item.url,
      datePublished,
      JSON.stringify(item.info),
    );
  }
}

// A small label hierarchy (one source per label plus an unlabeled source) so
// the sources tree renders every level: root, top-level labels/sources,
// nested labels and sources, and a depth-3 source.
const LABEL_TREE = [
  { name: "Unlabeled feed", label: null },
  { name: "Cars feed", label: "cars" },
  { name: "Makes feed", label: "cars/makes" },
  { name: "Racing feed", label: "cars/makes/racing" },
  { name: "News feed", label: "news" },
  { name: "Tech feed", label: "news/tech" },
];

function seedLabelTree(db, userId) {
  const insertSource = db.prepare(
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
  );
  const insertLabel = db.prepare(
    "INSERT INTO sources_labels (id, sourceId, name, info) VALUES (?, ?, ?, ?)",
  );
  for (const entry of LABEL_TREE) {
    const sourceId = crypto.randomUUID();
    insertSource.run(
      sourceId,
      userId,
      entry.name,
      JSON.stringify({ url: `https://example.com/${sourceId}` }),
    );
    if (entry.label) {
      insertLabel.run(crypto.randomUUID(), sourceId, entry.label, "{}");
    }
  }
}

async function resetItemsUnread(base, authHeaders, items) {
  const res = await fetch(`${base}/api/items/status`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      status: "unread",
      itemIds: items.map((i) => i.id),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resetting items to unread failed: ${res.status}`);
  }
}

// Sources list page, no dialog open, advanced filters closed (fresh store).
function collectListGeometry() {
  const rectOf = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
    };
  };
  const cards = [...document.querySelectorAll("article.sourceitem-layout")].map(
    (card) => ({
      card: rectOf(card),
      title: rectOf(card.querySelector(".sourceitem-layout-title")),
      actions: rectOf(card.querySelector(".sourceitem-actions-row")),
    }),
  );
  const actionsBar = document.querySelector("#sources-items-actions");
  return {
    viewportWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    cards,
    actionsBarHeight: actionsBar ? actionsBar.clientHeight : null,
    actionsBar: rectOf(actionsBar),
    searchInput: rectOf(
      document.querySelector("#sources-items-search-filter"),
    ),
  };
}

// Advanced filters (sort, dates, tags) are collapsed on a fresh store. Once
// opened, every labeled field must stay inside the actions bar, keep a
// readable width (a narrow date input collapses to just its calendar icon)
// and share the controls' height.
function collectFilterBarGeometry() {
  const rectOf = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  };
  return {
    viewportWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bar: rectOf(document.querySelector("#sources-items-actions")),
    advanced: rectOf(document.querySelector(".actions-row-advanced")),
    fields: [...document.querySelectorAll(".actions-row-field")].map((field) => ({
      label: (field.querySelector(".actions-row-label")?.textContent || "").trim(),
      field: rectOf(field),
      control: rectOf(field.querySelector("select, input")),
    })),
  };
}

async function runFilterLayoutState(page, viewport, tmpDir) {
  const caseName = `${viewport.name}/filters-open`;
  const hasFailure = () => failures.some((f) => f.caseName === caseName);

  await page.evaluate(() => {
    document.querySelector('[aria-label="More filters"]')?.click();
  });
  await page.waitForFunction(
    () => {
      const advanced = document.querySelector(".actions-row-advanced");
      return !!advanced && getComputedStyle(advanced).display !== "none";
    },
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
  await new Promise((resolve) => setTimeout(resolve, 150));

  const data = await page.evaluate(collectFilterBarGeometry);

  if (data.docScrollWidth > data.viewportWidth) {
    fail(
      caseName,
      `horizontal overflow: document scrollWidth ${data.docScrollWidth}px > viewport ${data.viewportWidth}px`,
    );
  }
  if (!data.bar || !data.advanced) {
    fail(caseName, "actions bar or advanced filters box is missing");
  } else if (
    data.advanced.top < data.bar.top - 1 ||
    data.advanced.bottom > data.bar.bottom + 1
  ) {
    fail(
      caseName,
      `advanced filters [${data.advanced.top.toFixed(0)}-${data.advanced.bottom.toFixed(0)}] escape the actions bar [${data.bar.top.toFixed(0)}-${data.bar.bottom.toFixed(0)}]`,
    );
  }
  if (data.fields.length < 3) {
    fail(
      caseName,
      `advanced filters render ${data.fields.length} fields, expected at least 3 (sort, from, to)`,
    );
  }
  const heights = [];
  for (const entry of data.fields) {
    if (!entry.label) {
      fail(caseName, "an advanced filter field has no visible label");
    }
    if (!entry.control || !entry.field) {
      fail(caseName, `field "${entry.label || "?"}" has no control box`);
      continue;
    }
    if (entry.control.width <= 0 || entry.control.height <= 0) {
      fail(caseName, `field "${entry.label}" control has no box`);
      continue;
    }
    if (data.advanced) {
      if (
        entry.field.left < data.advanced.left - 1 ||
        entry.field.right > data.advanced.right + 1
      ) {
        fail(
          caseName,
          `field "${entry.label}" [${entry.field.left.toFixed(0)}-${entry.field.right.toFixed(0)}] escapes the advanced filters box [${data.advanced.left.toFixed(0)}-${data.advanced.right.toFixed(0)}]`,
        );
      }
    }
    if (viewport.isMobile && entry.control.width < 110) {
      fail(
        caseName,
        `field "${entry.label}" control width ${entry.control.width.toFixed(0)}px < 110px on mobile (date values would be hidden)`,
      );
    }
    heights.push(entry.control.height);
  }
  if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 1) {
    fail(
      caseName,
      `advanced filter controls have inconsistent heights: ${heights.map((h) => h.toFixed(0)).join(", ")}px`,
    );
  }

  // The two date bounds form one range: they must stay side by side on the
  // same row (on mobile they get a dedicated row under the sort control).
  const fromField = data.fields.find((entry) => entry.label === "From");
  const toField = data.fields.find((entry) => entry.label === "To");
  if (!fromField?.field || !toField?.field) {
    fail(caseName, 'the "From" or "To" date field is missing');
  } else {
    if (Math.abs(fromField.field.top - toField.field.top) > 1) {
      fail(
        caseName,
        `From and To date fields are on different rows: tops ${fromField.field.top.toFixed(0)}px vs ${toField.field.top.toFixed(0)}px`,
      );
    }
    if (toField.field.left <= fromField.field.left) {
      fail(
        caseName,
        `From is not left of To: lefts ${fromField.field.left.toFixed(0)}px vs ${toField.field.left.toFixed(0)}px`,
      );
    }
  }

  if (hasFailure()) {
    const shot = path.join(tmpDir, `${caseName.replace(/[^\w.-]+/g, "_")}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    console.error(`    Screenshot: ${shot}`);
  }
}

// Runs in the page. Indentation is depth * one step: every row exposes its
// depth, its computed left padding and the boxes of its icon, name and caret,
// so the checks can prove that content starts exactly at the padding edge
// (nothing is reserved for carets) and that labels and sources at one depth
// share one column.
function collectSourceTreeGeometry() {
  const rectOf = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  };
  const list = document.querySelector("#sources-list");
  const rows = [
    ...document.querySelectorAll("#sources-list .source-tree-row"),
  ].map((row) => {
    const name = row.querySelector(".source-tree-name");
    const icon = row.querySelector(".source-tree-icon");
    const caret = row.querySelector(".source-tree-caret");
    return {
      depth: Number(row.dataset.treeDepth),
      kind: row.dataset.treeKind,
      isRoot: row.dataset.treeKind === "root",
      isLabel: row.dataset.treeKind === "label",
      hasCaret: Boolean(caret),
      caretBox: rectOf(caret),
      iconBox: rectOf(icon),
      name: (name?.textContent || "").trim(),
      nameBox: rectOf(name),
      rowBox: rectOf(row),
      paddingLeft: Number.parseFloat(
        window.getComputedStyle(row).paddingLeft,
      ),
    };
  });
  return {
    viewportWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    list: rectOf(list),
    listScrollWidth: list ? list.scrollWidth : null,
    listClientWidth: list ? list.clientWidth : null,
    rows,
  };
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function runSourceTreeState(page, base, viewport, tmpDir) {
  const caseName = `${viewport.name}/sources-tree`;
  console.log(`  ${viewport.name} / sources-tree`);

  await page.goto(`${base}/sources`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#sources-list .source-tree-row", {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#sources-list .source-tree-row").length >= 4,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
  await new Promise((resolve) => setTimeout(resolve, 150));

  const data = await page.evaluate(collectSourceTreeGeometry);

  if (data.docScrollWidth > data.viewportWidth) {
    fail(
      caseName,
      `horizontal overflow: document scrollWidth ${data.docScrollWidth}px > viewport ${data.viewportWidth}px`,
    );
  }
  if (data.rows.length < 7) {
    fail(
      caseName,
      `the sources tree rendered ${data.rows.length} rows, expected at least 7 (root, labels and sources)`,
    );
  }
  if (!data.rows.some((row) => row.isRoot)) {
    fail(caseName, "the sources tree has no root row");
  }
  if (!data.rows.some((row) => row.isLabel && !row.isRoot)) {
    fail(caseName, "the sources tree has no label row");
  }
  if (!data.rows.some((row) => !row.isLabel && !row.isRoot)) {
    fail(caseName, "the sources tree has no source row");
  }

  // The root sits at the list content edge: no caret and no reserved column.
  const root = data.rows.find((row) => row.isRoot);
  if (root.hasCaret) {
    fail(caseName, 'the root row renders a disclosure caret');
  }

  // Indentation is depth * one step and nothing else: every row's content
  // starts exactly at its padding edge (no empty caret column pushes sources
  // or leaf labels inwards) and the padding follows depth linearly.
  const rootPadding = root.paddingLeft;
  const depthRows = data.rows.filter((row) => row.depth === 1);
  const levelPadding = depthRows.length > 0 ? depthRows[0].paddingLeft : null;
  const indentStep =
    levelPadding === null ? null : levelPadding - rootPadding;
  if (indentStep === null || indentStep < 8) {
    fail(
      caseName,
      `the first level of children is not indented (padding ${rootPadding}px at depth 0, ${levelPadding}px at depth 1)`,
    );
  } else {
    for (const row of data.rows) {
      const expected = rootPadding + row.depth * indentStep;
      if (Math.abs(row.paddingLeft - expected) > 1) {
        fail(
          caseName,
          `row "${row.name}" (depth ${row.depth}, ${row.kind}) is padded ${row.paddingLeft.toFixed(1)}px, expected ${expected.toFixed(1)}px (${rootPadding.toFixed(1)} + ${row.depth} * ${indentStep.toFixed(1)})`,
        );
      }
    }
  }
  for (const row of data.rows) {
    if (!row.iconBox) {
      fail(caseName, `row "${row.name || "?"}" has no icon cell`);
      continue;
    }
    const contentOffset = row.iconBox.left - row.rowBox.left;
    if (Math.abs(contentOffset - row.paddingLeft) > 1) {
      fail(
        caseName,
        `row "${row.name}" (depth ${row.depth}, ${row.kind}) starts its content at ${contentOffset.toFixed(1)}px but is padded ${row.paddingLeft.toFixed(1)}px: something is reserved before the icon`,
      );
    }
    // A caret is decoration in the gutter: it must stay left of the content.
    if (row.hasCaret && row.caretBox) {
      if (row.caretBox.right > row.iconBox.left + 0.5) {
        fail(
          caseName,
          `row "${row.name}" caret (right ${row.caretBox.right.toFixed(1)}px) overlaps its content (icon left ${row.iconBox.left.toFixed(1)}px)`,
        );
      }
      if (row.caretBox.left < row.rowBox.left - 0.5) {
        fail(
          caseName,
          `row "${row.name}" caret starts outside the row (${row.caretBox.left.toFixed(1)}px < ${row.rowBox.left.toFixed(1)}px)`,
        );
      }
    }
  }

  // Group the content cells by hierarchy depth: every row at a depth — label
  // or source, with or without a caret — must share the same icon and name x.
  const byDepth = new Map();
  for (const row of data.rows) {
    if (!row.nameBox || !row.iconBox) {
      fail(caseName, `row "${row.name || "?"}" has no name or icon cell`);
      continue;
    }
    if (!byDepth.has(row.depth)) {
      byDepth.set(row.depth, []);
    }
    byDepth.get(row.depth).push(row);
  }
  const depths = [...byDepth.keys()].sort((left, right) => left - right);
  for (let depth = 0; depth <= 3; depth++) {
    if (!byDepth.has(depth)) {
      fail(caseName, `the sources tree has no row at depth ${depth}`);
    }
  }
  for (const depth of depths) {
    const rows = byDepth.get(depth);
    const nameLefts = rows.map((row) => row.nameBox.left);
    if (Math.max(...nameLefts) - Math.min(...nameLefts) > 1) {
      fail(
        caseName,
        `rows at depth ${depth} do not share one name column: ${rows.map((row) => `"${row.name}" ${row.nameBox.left.toFixed(1)}px`).join(", ")}`,
      );
    }
    const iconLefts = rows.map((row) => row.iconBox.left);
    if (Math.max(...iconLefts) - Math.min(...iconLefts) > 1) {
      fail(
        caseName,
        `rows at depth ${depth} do not share one icon column: ${rows.map((row) => `"${row.name}" ${row.iconBox.left.toFixed(1)}px`).join(", ")}`,
      );
    }
  }

  // Consecutive levels must step in by the same, clearly visible amount. This
  // is the invariant a "flat" first level or a bigger source step breaks.
  const steps = [];
  for (let index = 1; index < depths.length; index++) {
    const previous = average(
      byDepth.get(depths[index - 1]).map((row) => row.nameBox.left),
    );
    const current = average(
      byDepth.get(depths[index]).map((row) => row.nameBox.left),
    );
    steps.push(current - previous);
  }
  const depthLabel = (step, index) =>
    `depth ${depths[index - 1]}→${depths[index]} step ${step.toFixed(1)}px`;
  if (steps.some((step) => step <= 0)) {
    fail(
      caseName,
      `a deeper level is not indented further: ${steps.map((step, index) => depthLabel(step, index + 1)).join(", ")}`,
    );
  } else if (steps.length > 1 && Math.max(...steps) - Math.min(...steps) > 1) {
    fail(
      caseName,
      `indentation steps are not equal: ${steps.map((step, index) => depthLabel(step, index + 1)).join(", ")}`,
    );
  }
  if (steps.length > 0 && steps[0] < 8) {
    fail(
      caseName,
      `the first level of children is not indented: ${depthLabel(steps[0], 1)} (minimum 8px)`,
    );
  }

  // Every name must stay inside the tree column: deep indentation may not push
  // rows out of the sidebar (where names would be clipped or scroll sideways).
  if (data.list) {
    for (const row of data.rows) {
      if (!row.nameBox) {
        continue;
      }
      if (
        row.nameBox.left < data.list.left - 1 ||
        row.nameBox.left > data.list.right
      ) {
        fail(
          caseName,
          `row "${row.name}" name starts at ${row.nameBox.left.toFixed(0)}px, outside the tree column [${data.list.left.toFixed(0)}-${data.list.right.toFixed(0)}]`,
        );
        break;
      }
    }
    if (
      data.listScrollWidth !== null &&
      data.listScrollWidth > data.listClientWidth + 1
    ) {
      fail(
        caseName,
        `the tree scrolls horizontally: content ${data.listScrollWidth}px > column ${data.listClientWidth}px`,
      );
    }
  }

  if (failures.some((entry) => entry.caseName === caseName)) {
    const shot = path.join(tmpDir, `${caseName.replace(/[^\w.-]+/g, "_")}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    console.error(`    Screenshot: ${shot}`);
  }
}

async function runListPageState(page, base, authHeaders, seedItems, viewport, tmpDir) {
  const caseName = `${viewport.name}/list-page`;
  console.log(`  ${viewport.name} / list-page`);

  await resetItemsUnread(base, authHeaders, Object.values(seedItems.items));
  await page.goto(`${base}/sources`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sourceitem-layout-title", {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.waitForSelector(".sourceitem-actions-row", {
    timeout: WAIT_TIMEOUT_MS,
  });

  const data = await page.evaluate(collectListGeometry);

  if (data.docScrollWidth > data.viewportWidth) {
    fail(
      caseName,
      `horizontal overflow: document scrollWidth ${data.docScrollWidth}px > viewport ${data.viewportWidth}px`,
    );
  }

  if (data.cards.length === 0) {
    fail(caseName, "no item cards rendered");
  }
  for (let i = 0; i < data.cards.length; i++) {
    const { card, title, actions } = data.cards[i];
    if (!title || !actions) {
      fail(caseName, `card #${i} is missing a title or actions row box`);
      continue;
    }
    const overlapsHorizontally =
      actions.left < title.right - 1 && actions.right > title.left + 1;
    const overlapsVertically =
      actions.top < title.bottom - 1 && actions.bottom > title.top + 1;
    if (overlapsHorizontally && overlapsVertically) {
      fail(
        caseName,
        `card #${i} actions row [${actions.top.toFixed(0)}-${actions.bottom.toFixed(0)}] overlaps title box [${title.top.toFixed(0)}-${title.bottom.toFixed(0)}]`,
      );
    }
    // The in-flow actions row must stay inside its card — a wider min-content
    // (buttons + ellipsized name) must compress the text, not overflow the
    // card edge where the list's overflow: hidden clips the last button.
    if (card && actions.right > card.right + 1) {
      fail(
        caseName,
        `card #${i} actions row right edge ${actions.right.toFixed(0)}px exceeds card right edge ${card.right.toFixed(0)}px`,
      );
    }
  }

  if (
    viewport.isMobile &&
    data.actionsBarHeight !== null &&
    data.actionsBarHeight > 48
  ) {
    fail(
      caseName,
      `actions bar height ${data.actionsBarHeight}px > 48px on mobile with filters closed`,
    );
  }

  if (!data.actionsBar || !data.searchInput) {
    fail(caseName, "actions bar or search input box is missing");
  } else {
    const topSpace = data.searchInput.top - data.actionsBar.top;
    const bottomSpace = data.actionsBar.bottom - data.searchInput.bottom;
    if (Math.abs(topSpace - bottomSpace) > 1) {
      fail(
        caseName,
        `actions bar spacing is asymmetric around the search input: ${topSpace.toFixed(0)}px above vs ${bottomSpace.toFixed(0)}px below`,
      );
    }
  }

  if (failures.some((f) => f.caseName === caseName)) {
    const shot = path.join(tmpDir, `${caseName.replace(/[^\w.-]+/g, "_")}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    console.error(`    Screenshot: ${shot}`);
  }

  await runFilterLayoutState(page, viewport, tmpDir);
}

// --------------------------------------------------------------------------
// Scrollable pages: /sources/new (fixed header + tabs, per-mode scroller) and
// /sources/newsletter (single page scroller down to the source-health panel).
// --------------------------------------------------------------------------

// Runs in the page. `main` is the app shell's clipping grid child; every page
// must stay inside its content box and provide its own scroll container.
function collectScrollMetrics({
  rootSelector,
  scrollerSelector,
  rowSelector,
  toggleSelector,
}) {
  const rectOf = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  };
  const main = document.querySelector("main");
  const root = document.querySelector(rootSelector);
  const scroller = document.querySelector(scrollerSelector);
  const toggle = toggleSelector
    ? document.querySelector(toggleSelector)
    : null;
  const rows = rowSelector ? [...document.querySelectorAll(rowSelector)] : [];
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const mainStyle = main ? getComputedStyle(main) : null;
  const scrollerStyle = scroller ? getComputedStyle(scroller) : null;
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    docScrollWidth: document.documentElement.scrollWidth,
    main: rectOf(main),
    mainPaddingTop: mainStyle ? parseFloat(mainStyle.paddingTop) : 0,
    mainPaddingBottom: mainStyle ? parseFloat(mainStyle.paddingBottom) : 0,
    root: rectOf(root),
    scroller: scroller
      ? {
          rect: rectOf(scroller),
          clientHeight: scroller.clientHeight,
          clientWidth: scroller.clientWidth,
          scrollHeight: scroller.scrollHeight,
          scrollWidth: scroller.scrollWidth,
          scrollTop: scroller.scrollTop,
          overflowY: scrollerStyle ? scrollerStyle.overflowY : "",
        }
      : null,
    toggle: rectOf(toggle),
    rowCount: rows.length,
    lastRow: rectOf(lastRow),
    lastRowButtons:
      lastRow === null
        ? []
        : [...lastRow.querySelectorAll("button")].map((button) => ({
            label: (button.textContent || "").trim().replace(/\s+/g, " "),
            ...rectOf(button),
          })),
  };
}

function assertPageBoundedInMain(caseName, data) {
  if (!data.main || !data.root) {
    fail(caseName, "page root or app shell main box is missing");
    return;
  }
  const contentTop = data.main.top + data.mainPaddingTop;
  const contentBottom = data.main.bottom - data.mainPaddingBottom;
  if (data.root.top < contentTop - 1) {
    fail(
      caseName,
      `page root top ${data.root.top.toFixed(1)}px is above main content top ${contentTop.toFixed(1)}px`,
    );
  }
  if (data.root.bottom > contentBottom + 1) {
    fail(
      caseName,
      `page root bottom ${data.root.bottom.toFixed(1)}px exceeds main content bottom ${contentBottom.toFixed(1)}px (main clips overflow)`,
    );
  }
}

function assertNoHorizontalOverflow(caseName, data) {
  if (data.docScrollWidth > data.viewportWidth) {
    fail(
      caseName,
      `horizontal overflow: document scrollWidth ${data.docScrollWidth}px > viewport ${data.viewportWidth}px`,
    );
  }
  if (data.scroller && data.scroller.scrollWidth > data.scroller.clientWidth + 1) {
    fail(
      caseName,
      `horizontal overflow in scroll container: scrollWidth ${data.scroller.scrollWidth}px > clientWidth ${data.scroller.clientWidth}px`,
    );
  }
}

function assertToggleInViewport(caseName, data, modeLabel) {
  if (!data.toggle) {
    fail(caseName, "mode toggle box is missing");
    return;
  }
  if (data.toggle.top < -1 || data.toggle.bottom > data.viewportHeight + 1) {
    fail(
      caseName,
      `mode toggle [${data.toggle.top.toFixed(0)}-${data.toggle.bottom.toFixed(0)}] is outside the viewport [0-${data.viewportHeight}] in the ${modeLabel} mode`,
    );
  }
}

function assertToggleFixed(caseName, before, after) {
  if (!before.toggle || !after.toggle) {
    fail(caseName, "mode toggle box is missing");
    return;
  }
  if (Math.abs(after.toggle.top - before.toggle.top) > 1) {
    fail(
      caseName,
      `mode toggle moved from top ${before.toggle.top.toFixed(1)}px to ${after.toggle.top.toFixed(1)}px while the content scrolled`,
    );
  }
}

function assertLastRowReachable(caseName, data, ...buttonLabels) {
  if (!data.scroller || !data.lastRow) {
    fail(caseName, "last row or scroll container is missing after scrolling");
    return;
  }
  const { rect } = data.scroller;
  if (data.lastRow.bottom > rect.bottom + 2) {
    fail(
      caseName,
      `last row bottom ${data.lastRow.bottom.toFixed(1)}px is below the scroll viewport bottom ${rect.bottom.toFixed(1)}px`,
    );
  }
  if (data.lastRow.top < rect.top - 2) {
    fail(
      caseName,
      `last row top ${data.lastRow.top.toFixed(1)}px is above the scroll viewport top ${rect.top.toFixed(1)}px`,
    );
  }
  for (const label of buttonLabels) {
    const button = data.lastRowButtons.find((entry) => entry.label === label);
    if (!button) {
      fail(caseName, `last row has no "${label}" button`);
      continue;
    }
    if (button.width <= 0 || button.height <= 0) {
      fail(caseName, `last row "${label}" button has no box`);
    } else if (button.top < rect.top - 2 || button.bottom > rect.bottom + 2) {
      fail(
        caseName,
        `last row "${label}" button [${button.top.toFixed(0)}-${button.bottom.toFixed(0)}] is outside the scroll viewport [${rect.top.toFixed(0)}-${rect.bottom.toFixed(0)}]`,
      );
    }
  }
}

async function scrollToBottom(page, scrollerSelector) {
  await page.evaluate((selector) => {
    const container = document.querySelector(selector);
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, scrollerSelector);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

// Focuses a control inside the scroller and presses PageDown; returns the
// resulting scrollTop (Chrome scrolls the focused element's scrollable
// ancestor with PageDown).
async function scrollAndPageDown(page, scrollerSelector, focusSelector) {
  await page.evaluate(([selector, focus]) => {
    const container = document.querySelector(selector);
    if (container) {
      container.scrollTop = 0;
    }
    const target = document.querySelector(focus);
    if (target) {
      target.focus();
    }
  }, [scrollerSelector, focusSelector]);
  await page.keyboard.press("PageDown");
  await new Promise((resolve) => setTimeout(resolve, 350));
  return page.evaluate((selector) => {
    const container = document.querySelector(selector);
    return container ? container.scrollTop : -1;
  }, scrollerSelector);
}

async function waitForModeButton(page, label) {
  await page.waitForFunction(
    (buttonLabel) =>
      [...document.querySelectorAll(".mode-btn")].some((button) =>
        (button.textContent || "").includes(buttonLabel),
      ),
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
    label,
  );
}

async function clickModeButton(page, label) {
  const clicked = await page.evaluate((buttonLabel) => {
    const button = [...document.querySelectorAll(".mode-btn")].find((entry) =>
      (entry.textContent || "").includes(buttonLabel),
    );
    if (!button) {
      return false;
    }
    button.click();
    return true;
  }, label);
  if (!clicked) {
    throw new Error(`Mode button not found: ${label}`);
  }
}

async function saveScrollArtifacts(page, prefix, tmpDir) {
  if (!failures.some((entry) => entry.caseName.startsWith(prefix))) {
    return;
  }
  const shot = path.join(tmpDir, `${prefix.replace(/[^\w.-]+/g, "_")}.png`);
  await page.screenshot({ path: shot }).catch(() => {});
  console.error(`    Screenshot: ${shot}`);
}

async function runNewSourceStates(page, base, viewport, tmpDir) {
  const prefix = `${viewport.name}/new-source-page`;
  console.log(`  ${viewport.name} / new-source-page`);

  const selectors = {
    rootSelector: ".new-source-page",
    scrollerSelector: ".mode-section",
    toggleSelector: ".mode-toggle",
  };

  // 1. Add by URL: default, short mode — regression guard.
  const urlCase = `${prefix}/add-by-url`;
  await page.goto(`${base}/sources/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(
    '.mode-section input[placeholder="https://example.com/feed.xml"]',
    { timeout: WAIT_TIMEOUT_MS },
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".mode-section button")].some((button) =>
        (button.textContent || "").includes("Find feeds"),
      ),
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
  const urlData = await page.evaluate(collectScrollMetrics, {
    ...selectors,
    rowSelector: null,
  });
  assertPageBoundedInMain(urlCase, urlData);
  assertNoHorizontalOverflow(urlCase, urlData);
  assertToggleInViewport(urlCase, urlData, "add-by-url");
  if (
    !urlData.scroller ||
    urlData.scroller.overflowY !== "auto"
  ) {
    fail(
      urlCase,
      `mode content overflow-y is "${urlData.scroller?.overflowY}", expected "auto"`,
    );
  } else if (
    urlData.scroller.scrollHeight >
    urlData.scroller.clientHeight + 2
  ) {
    fail(
      urlCase,
      `add-by-url content unexpectedly scrolls: scrollHeight ${urlData.scroller.scrollHeight}px > clientHeight ${urlData.scroller.clientHeight}px`,
    );
  }
  await saveScrollArtifacts(page, prefix, tmpDir);

  // 2. Search Podcasts with 25 mocked results.
  const searchCase = `${prefix}/search`;
  await waitForModeButton(page, "Search Podcasts");
  await clickModeButton(page, "Search Podcasts");
  await page.waitForSelector('.mode-section input[type="search"]', {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.type('.mode-section input[type="search"]', "layout");
  await page.waitForFunction(
    () => document.querySelectorAll(".search-result-item").length === 25,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );

  const searchSelectors = {
    ...selectors,
    rowSelector: ".search-result-item",
  };
  const searchBefore = await page.evaluate(
    collectScrollMetrics,
    searchSelectors,
  );
  assertPageBoundedInMain(searchCase, searchBefore);
  assertNoHorizontalOverflow(searchCase, searchBefore);
  assertToggleInViewport(searchCase, searchBefore, "search");
  if (!searchBefore.scroller) {
    fail(searchCase, "mode content container is missing");
  } else {
    if (searchBefore.scroller.overflowY !== "auto") {
      fail(
        searchCase,
        `mode content overflow-y is "${searchBefore.scroller.overflowY}", expected "auto"`,
      );
    }
    if (
      searchBefore.scroller.scrollHeight <
      searchBefore.scroller.clientHeight + 10
    ) {
      fail(
        searchCase,
        `search results do not overflow the mode content: scrollHeight ${searchBefore.scroller.scrollHeight}px vs clientHeight ${searchBefore.scroller.clientHeight}px`,
      );
    }
  }

  await scrollToBottom(page, ".mode-section");
  const searchAfter = await page.evaluate(
    collectScrollMetrics,
    searchSelectors,
  );
  if (!searchAfter.scroller || searchAfter.scroller.scrollTop <= 0) {
    fail(
      searchCase,
      `programmatic scroll did not move the mode content (scrollTop ${searchAfter.scroller?.scrollTop})`,
    );
  }
  assertLastRowReachable(searchCase, searchAfter, "Add");
  assertToggleFixed(searchCase, searchBefore, searchAfter);

  const searchKeyCase = `${prefix}/search/keyboard`;
  const searchKeyTop = await scrollAndPageDown(
    page,
    ".mode-section",
    '.mode-section input[type="search"]',
  );
  if (!(searchKeyTop > 0)) {
    fail(
      searchKeyCase,
      `PageDown did not scroll the search results (scrollTop ${searchKeyTop})`,
    );
  }
  await saveScrollArtifacts(page, prefix, tmpDir);

  // 3. Newsletters, switched from the scrolled search results (the fixed tabs
  // must stay clickable while a list is scrolled).
  const newsCase = `${prefix}/newsletter`;
  await waitForModeButton(page, "Newsletters");
  await clickModeButton(page, "Newsletters");
  await page.waitForFunction(
    () => document.querySelectorAll(".catalogue-row").length === 25,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
  const switchedTop = await page.evaluate(
    () => document.querySelector(".mode-section")?.scrollTop ?? null,
  );
  if (switchedTop !== 0) {
    fail(
      newsCase,
      `switching to the newsletter mode kept scrollTop ${switchedTop}, expected 0`,
    );
  }

  const toolbar = await page.evaluate(() => {
    const input = document.querySelector(".catalogue-toolbar input");
    const select = document.querySelector(".catalogue-toolbar select");
    const bulk = [...document.querySelectorAll(".catalogue-bulk button")].find(
      (button) => (button.textContent || "").includes("Add selected"),
    );
    return {
      hasSearch: !!input,
      hasSelect: !!select,
      bulkLabel: bulk
        ? (bulk.textContent || "").trim().replace(/\s+/g, " ")
        : null,
    };
  });
  if (!toolbar.hasSearch || !toolbar.hasSelect) {
    fail(
      newsCase,
      "catalogue toolbar search input or filter select is missing",
    );
  }
  if (toolbar.bulkLabel !== "Add selected (0)") {
    fail(
      newsCase,
      `bulk action label is "${toolbar.bulkLabel}", expected "Add selected (0)"`,
    );
  }

  // Search/filter still work with the mocked catalogue.
  await page.type(".catalogue-toolbar input", "Synthetic Newsletter 25");
  await page.waitForFunction(
    () => document.querySelectorAll(".catalogue-row").length === 1,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
  await page.evaluate(() => {
    const input = document.querySelector(".catalogue-toolbar input");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".catalogue-row").length === 25,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );

  // Bulk bar reachable at the top of the catalogue.
  await page.evaluate(() => {
    const container = document.querySelector(".mode-section");
    if (container) {
      container.scrollTop = 0;
    }
  });
  const newsSelectors = { ...selectors, rowSelector: ".catalogue-row" };
  const newsTop = await page.evaluate(collectScrollMetrics, newsSelectors);
  assertPageBoundedInMain(newsCase, newsTop);
  assertNoHorizontalOverflow(newsCase, newsTop);
  assertToggleInViewport(newsCase, newsTop, "newsletter");
  if (!newsTop.scroller) {
    fail(newsCase, "mode content container is missing");
  } else {
    if (newsTop.scroller.overflowY !== "auto") {
      fail(
        newsCase,
        `mode content overflow-y is "${newsTop.scroller.overflowY}", expected "auto"`,
      );
    }
    if (
      newsTop.scroller.scrollHeight <
      newsTop.scroller.clientHeight + 10
    ) {
      fail(
        newsCase,
        `newsletter catalogue does not overflow the mode content: scrollHeight ${newsTop.scroller.scrollHeight}px vs clientHeight ${newsTop.scroller.clientHeight}px`,
      );
    }
  }
  const bulkRect = await page.evaluate(() => {
    const bulk = document.querySelector(".catalogue-bulk");
    if (!bulk) {
      return null;
    }
    const rect = bulk.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
  if (!bulkRect) {
    fail(newsCase, "catalogue bulk bar is missing");
  } else if (newsTop.scroller) {
    const { rect } = newsTop.scroller;
    if (bulkRect.top < rect.top - 2 || bulkRect.bottom > rect.bottom + 2) {
      fail(
        newsCase,
        `bulk bar [${bulkRect.top.toFixed(0)}-${bulkRect.bottom.toFixed(0)}] is not reachable at the top of the catalogue viewport [${rect.top.toFixed(0)}-${rect.bottom.toFixed(0)}]`,
      );
    }
  }

  await scrollToBottom(page, ".mode-section");
  const newsAfter = await page.evaluate(collectScrollMetrics, newsSelectors);
  if (!newsAfter.scroller || newsAfter.scroller.scrollTop <= 0) {
    fail(
      newsCase,
      `programmatic scroll did not move the newsletter catalogue (scrollTop ${newsAfter.scroller?.scrollTop})`,
    );
  }
  assertLastRowReachable(newsCase, newsAfter, "Add", "Ignore");
  assertToggleFixed(newsCase, newsTop, newsAfter);

  const newsKeyCase = `${prefix}/newsletter/keyboard`;
  const newsKeyTop = await scrollAndPageDown(
    page,
    ".mode-section",
    '.catalogue-row input[type="checkbox"]',
  );
  if (!(newsKeyTop > 0)) {
    fail(
      newsKeyCase,
      `PageDown did not scroll the newsletter catalogue (scrollTop ${newsKeyTop})`,
    );
  }
  await saveScrollArtifacts(page, prefix, tmpDir);
}

async function runNewsletterPageState(page, base, viewport, tmpDir) {
  const prefix = `${viewport.name}/newsletter-page`;
  console.log(`  ${viewport.name} / newsletter-page`);

  const selectors = {
    rootSelector: ".newsletter-page",
    scrollerSelector: ".newsletter-page",
    rowSelector: ".catalogue-row",
    toggleSelector: null,
  };

  await page.goto(`${base}/sources/newsletter`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".catalogue-row").length === 25,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
  await page.waitForSelector(".newsletter-repair", {
    timeout: WAIT_TIMEOUT_MS,
  });

  const data = await page.evaluate(collectScrollMetrics, selectors);
  assertPageBoundedInMain(prefix, data);
  assertNoHorizontalOverflow(prefix, data);
  if (!data.scroller) {
    fail(prefix, "newsletter page scroll container is missing");
    await saveScrollArtifacts(page, prefix, tmpDir);
    return;
  }
  if (data.scroller.overflowY !== "auto") {
    fail(
      prefix,
      `newsletter page overflow-y is "${data.scroller.overflowY}", expected "auto"`,
    );
  }
  if (data.scroller.scrollHeight < data.scroller.clientHeight + 10) {
    fail(
      prefix,
      `newsletter page does not scroll: scrollHeight ${data.scroller.scrollHeight}px vs clientHeight ${data.scroller.clientHeight}px`,
    );
  }

  // The last catalogue row must be reachable.
  await page.evaluate(() => {
    const rows = document.querySelectorAll(".catalogue-row");
    const last = rows[rows.length - 1];
    if (last) {
      last.scrollIntoView({ block: "end" });
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const rowData = await page.evaluate(collectScrollMetrics, selectors);
  assertLastRowReachable(prefix, rowData, "Add", "Ignore");

  // The source-health panel must be reachable at the bottom.
  await scrollToBottom(page, ".newsletter-page");
  const bottomData = await page.evaluate(collectScrollMetrics, selectors);
  if (!bottomData.scroller || bottomData.scroller.scrollTop <= 0) {
    fail(
      prefix,
      `page did not scroll to the source-health panel (scrollTop ${bottomData.scroller?.scrollTop})`,
    );
  }
  const repair = await page.evaluate(() => {
    const rectOf = (el) => {
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const panel = document.querySelector(".newsletter-repair");
    return {
      panel: rectOf(panel),
      actions: panel
        ? [...panel.querySelectorAll("button")].map((button) => ({
            label: (button.textContent || "").trim().replace(/\s+/g, " "),
            ...rectOf(button),
          }))
        : [],
    };
  });
  if (!repair.panel) {
    fail(prefix, "source-health panel is missing");
  } else {
    const { rect } = bottomData.scroller;
    if (repair.panel.top < rect.top - 2 || repair.panel.bottom > rect.bottom + 2) {
      fail(
        prefix,
        `source-health panel [${repair.panel.top.toFixed(0)}-${repair.panel.bottom.toFixed(0)}] is not visible in the scroll viewport [${rect.top.toFixed(0)}-${rect.bottom.toFixed(0)}]`,
      );
    }
    for (const label of ["Check sources", "Repair now"]) {
      const button = repair.actions.find((entry) => entry.label === label);
      if (!button) {
        fail(prefix, `source-health panel has no "${label}" button`);
      } else if (button.width <= 0 || button.height <= 0) {
        fail(prefix, `source-health panel "${label}" button has no box`);
      }
    }
  }

  const keyTop = await scrollAndPageDown(
    page,
    ".newsletter-page",
    '.catalogue-row input[type="checkbox"]',
  );
  if (!(keyTop > 0)) {
    fail(
      `${prefix}/keyboard`,
      `PageDown did not scroll the newsletter page (scrollTop ${keyTop})`,
    );
  }
  await saveScrollArtifacts(page, prefix, tmpDir);
}

// Source edit page: long health block, URL finder and 25 podcast results must
// stay inside `<main>` and scroll down to the Labels field and Update/Delete.
async function runEditSourcePageState(page, base, viewport, tmpDir) {
  const prefix = `${viewport.name}/edit-source-page`;
  console.log(`  ${viewport.name} / edit-source-page`);

  const selectors = {
    rootSelector: ".source-edit-page",
    scrollerSelector: ".source-edit-page",
    rowSelector: ".finder-candidate",
    toggleSelector: null,
  };

  await page.goto(`${base}/sources/${EDIT_SOURCE_ID}`, {
    waitUntil: "domcontentloaded",
  });
  // The finder is collapsed by default; expand it to reach the podcast search.
  await page.waitForSelector(".source-finder-toggle", {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.click(".source-finder-toggle");
  await page.waitForSelector(".finder-podcast-search input[type='search']", {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.type(".finder-podcast-search input[type='search']", "layout");
  await page.waitForFunction(
    () => document.querySelectorAll(".finder-candidate").length === 25,
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );

  const data = await page.evaluate(collectScrollMetrics, selectors);
  assertPageBoundedInMain(prefix, data);
  assertNoHorizontalOverflow(prefix, data);
  if (!data.scroller) {
    fail(prefix, "source edit page scroll container is missing");
    await saveScrollArtifacts(page, prefix, tmpDir);
    return;
  }
  if (data.scroller.overflowY !== "auto") {
    fail(
      prefix,
      `source edit page overflow-y is "${data.scroller.overflowY}", expected "auto"`,
    );
  }
  if (data.scroller.scrollHeight < data.scroller.clientHeight + 10) {
    fail(
      prefix,
      `source edit page does not scroll: scrollHeight ${data.scroller.scrollHeight}px vs clientHeight ${data.scroller.clientHeight}px`,
    );
  }

  // The last podcast result must be reachable.
  await page.evaluate(() => {
    const rows = document.querySelectorAll(".finder-candidate");
    const last = rows[rows.length - 1];
    if (last) {
      last.scrollIntoView({ block: "end" });
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const rowData = await page.evaluate(collectScrollMetrics, selectors);
  assertLastRowReachable(prefix, rowData);

  // The Labels field and the Update/Delete actions must be reachable at the
  // bottom of the page.
  await scrollToBottom(page, ".source-edit-page");
  const bottomData = await page.evaluate(collectScrollMetrics, selectors);
  if (!bottomData.scroller || bottomData.scroller.scrollTop <= 0) {
    fail(
      prefix,
      `page did not scroll to the Labels/actions section (scrollTop ${bottomData.scroller?.scrollTop})`,
    );
  }
  const actions = await page.evaluate(() => {
    const root = document.querySelector(".source-edit-page");
    const container = root ? root.getBoundingClientRect() : null;
    const rectOf = (el) => {
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const buttons = [...(root?.querySelectorAll("button") ?? [])]
      .filter((button) =>
        ["Update", "Delete"].includes((button.textContent || "").trim()),
      )
      .map((button) => ({
        label: (button.textContent || "").trim(),
        ...rectOf(button),
      }));
    const labels = [...(root?.querySelectorAll("label") ?? [])].some(
      (label) => (label.textContent || "").trim() === "Labels",
    );
    return {
      container: container
        ? {
            top: container.top,
            bottom: container.bottom,
          }
        : null,
      buttons,
      hasLabelsField: labels,
    };
  });
  if (!actions.hasLabelsField) {
    fail(prefix, "Labels field is missing");
  }
  for (const label of ["Update", "Delete"]) {
    const button = actions.buttons.find((entry) => entry.label === label);
    if (!button) {
      fail(prefix, `"${label}" button is missing`);
    } else if (button.width <= 0 || button.height <= 0) {
      fail(prefix, `"${label}" button has no box`);
    } else if (
      actions.container &&
      (button.top < actions.container.top - 2 ||
        button.bottom > actions.container.bottom + 2)
    ) {
      fail(
        prefix,
        `"${label}" button [${button.top.toFixed(0)}-${button.bottom.toFixed(0)}] is outside the page viewport [${actions.container.top.toFixed(0)}-${actions.container.bottom.toFixed(0)}]`,
      );
    }
  }

  const keyTop = await scrollAndPageDown(
    page,
    ".source-edit-page",
    ".finder-podcast-search input[type='search']",
  );
  if (!(keyTop > 0)) {
    fail(
      `${prefix}/keyboard`,
      `PageDown did not scroll the source edit page (scrollTop ${keyTop})`,
    );
  }
  await saveScrollArtifacts(page, prefix, tmpDir);
}

async function runState(page, base, authHeaders, seed, state, viewport, tmpDir) {
  const item = seed.items[state.itemKey];
  console.log(`  ${viewport.name} / ${state.name}`);

  await resetItemsUnread(base, authHeaders, Object.values(seed.items));
  await page.goto(`${base}/sources`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sourceitem-layout-title", {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.evaluate((title) => {
    const cards = [...document.querySelectorAll(".sourceitem-layout-title")];
    const card = cards.find((c) => c.textContent.includes(title));
    if (!card) {
      throw new Error(`Item card not found for title: ${title}`);
    }
    card.click();
  }, item.title);
  await page.waitForSelector("dialog.source-dialog[open]", {
    timeout: WAIT_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => {
      const footer = document.querySelector(
        "dialog.source-dialog footer.source-dialog-footer",
      );
      return !!footer && footer.querySelectorAll("button").length >= 3;
    },
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );

  const expected = { buttons: state.buttons, expectHeader: true };
  if (state.clickButton) {
    await clickFooterButton(page, state.clickButton);
    if (state.name === "reader") {
      await page.waitForFunction(
        () => {
          const body = document.querySelector(".source-dialog-body");
          return (
            !!body &&
            (!!body.querySelector(".reader-content") ||
              body.textContent.includes("Reader view unavailable"))
          );
        },
        { polling: 250, timeout: WAIT_TIMEOUT_MS },
      );
      const readerReady = await page.evaluate(() =>
        !!document.querySelector(".source-dialog-body .reader-content"),
      );
      expected.buttons = readerReady
        ? STATES[1].buttonsAlternatives[0]
        : STATES[1].buttonsAlternatives[1];
    } else if (state.name === "full-source") {
      await page.waitForFunction(
        () =>
          !!document.querySelector(".source-dialog-body iframe[src]"),
        { polling: 250, timeout: WAIT_TIMEOUT_MS },
      );
    }
  } else {
    await page.waitForFunction(
      (count) => {
        const footer = document.querySelector(
          "dialog.source-dialog footer.source-dialog-footer",
        );
        return !!footer && footer.querySelectorAll("button").length >= count;
      },
      { polling: 250, timeout: WAIT_TIMEOUT_MS },
      state.buttons.length,
    );
  }

  const normalCase = `${viewport.name}/${state.name}/normal`;
  await runCase(page, normalCase, expected, tmpDir);
  await page
    .screenshot({
      path: path.join(tmpDir, `${normalCase.replace(/[^\w.-]+/g, "_")}.png`),
    })
    .catch(() => {});

  // Degraded-DOM mutations: the layout must survive a header that stops
  // generating a box (removed or display:none) — the historical failure mode.
  await page.evaluate(() => {
    const header = document.querySelector(
      "dialog.source-dialog article > header",
    );
    window.__layoutCheckHeader = header;
    header.remove();
  });
  await nextFrames(page);
  await runCase(page, `${viewport.name}/${state.name}/header-removed`, {
    ...expected,
    expectHeader: false,
  }, tmpDir);

  await page.evaluate(() => {
    const article = document.querySelector("dialog.source-dialog article");
    article.insertBefore(window.__layoutCheckHeader, article.firstChild);
  });
  await nextFrames(page);
  await page.evaluate(() => {
    document.querySelector("dialog.source-dialog article > header").style.display =
      "none";
  });
  await nextFrames(page);
  await runCase(page, `${viewport.name}/${state.name}/header-hidden`, expected, tmpDir);

  await page.evaluate(() => {
    document.querySelector("dialog.source-dialog article > header").style.display =
      "";
  });
  await nextFrames(page);

  await clickFooterButton(page, "Close");
  await page.waitForFunction(
    () => !document.querySelector("dialog.source-dialog"),
    { polling: 250, timeout: WAIT_TIMEOUT_MS },
  );
}

async function clickFooterButton(page, label) {
  const clicked = await page.evaluate((buttonLabel) => {
    const footer = document.querySelector(
      "dialog.source-dialog footer.source-dialog-footer",
    );
    const button = [...(footer?.querySelectorAll("button") ?? [])].find((b) =>
      (b.textContent || "").trim().includes(buttonLabel),
    );
    if (!button) {
      return false;
    }
    button.click();
    return true;
  }, label);
  if (!clicked) {
    throw new Error(`Footer button not found: ${label}`);
  }
}

async function nextFrames(page) {
  // getBoundingClientRect forces layout synchronously; the delay just lets
  // any pending style/DOM mutation settle before measuring.
  await new Promise((resolve) => setTimeout(resolve, 120));
}

function collectDialogGeometry() {
  const dlg = document.querySelector("dialog.source-dialog");
  const article = dlg ? dlg.querySelector("article") : null;
  const rectOf = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  };
  const buttons = [];
  const footer = article
    ? article.querySelector(":scope > footer.source-dialog-footer")
    : null;
  if (footer) {
    for (const b of footer.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      buttons.push({
        label: (b.textContent || "").trim().replace(/\s+/g, " "),
        height: r.height,
        width: r.width,
        visible: r.width > 0 && r.height > 0,
      });
    }
  }
  const header = article ? article.querySelector(":scope > header") : null;
  const body = article
    ? article.querySelector(":scope > .source-dialog-body")
    : null;
  return {
    dialogOpen: dlg ? dlg.open : false,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dialog: rectOf(dlg),
    article: rectOf(article),
    header: header
      ? { rect: rectOf(header), gridRowStart: getComputedStyle(header).gridRowStart }
      : null,
    body: body
      ? { rect: rectOf(body), gridRowStart: getComputedStyle(body).gridRowStart }
      : null,
    footer: footer
      ? { rect: rectOf(footer), gridRowStart: getComputedStyle(footer).gridRowStart }
      : null,
    buttons,
  };
}

async function runCase(page, caseName, expected, tmpDir) {
  const data = await page.evaluate(collectDialogGeometry);

  if (!data.dialogOpen) {
    fail(caseName, "dialog is not open");
    return;
  }

  // Dialog fills the viewport (100dvh/100dvw sanity).
  if (Math.abs(data.dialog.height - data.viewportHeight) > 2) {
    fail(
      caseName,
      `dialog height ${data.dialog.height}px != viewport ${data.viewportHeight}px`,
    );
  }
  if (Math.abs(data.dialog.width - data.viewportWidth) > 2) {
    fail(
      caseName,
      `dialog width ${data.dialog.width}px != viewport ${data.viewportWidth}px`,
    );
  }

  if (!data.article || data.article.height <= 0) {
    fail(caseName, "dialog article has no box");
    return;
  }

  // Grid-row pins: each region stays on its own track no matter what happens
  // to the others (auto-placement is what let the footer slide into the 1fr
  // row and stretch its buttons grotesquely).
  if (expected.expectHeader) {
    if (!data.header) {
      fail(caseName, "article > header is missing");
    } else if (data.header.gridRowStart !== "1") {
      fail(caseName, `header grid-row is ${data.header.gridRowStart}, expected 1`);
    }
  }
  if (!data.body) {
    fail(caseName, "article > .source-dialog-body is missing");
  } else {
    if (data.body.gridRowStart !== "2") {
      fail(caseName, `body grid-row is ${data.body.gridRowStart}, expected 2`);
    }
    const minBodyShare = data.article.height * 0.4;
    if (data.body.rect.height < minBodyShare) {
      fail(
        caseName,
        `body height ${data.body.rect.height}px < 40% of article (${minBodyShare.toFixed(0)}px)`,
      );
    }
  }
  if (!data.footer) {
    fail(caseName, "article > footer.source-dialog-footer is missing");
    return;
  }
  if (data.footer.gridRowStart !== "3") {
    fail(caseName, `footer grid-row is ${data.footer.gridRowStart}, expected 3`);
  }
  if (data.footer.rect.bottom > data.article.bottom + 1) {
    fail(
      caseName,
      `footer bottom ${data.footer.rect.bottom}px exceeds article bottom ${data.article.bottom}px`,
    );
  }
  if (data.footer.rect.top < data.article.top - 1) {
    fail(
      caseName,
      `footer top ${data.footer.rect.top}px above article top ${data.article.top}px`,
    );
  }

  // Buttons: labels as designed, content-sized (40-80px tall) rows.
  const labels = data.buttons.map((b) => b.label);
  if (labels.length !== expected.buttons.length) {
    fail(caseName, `footer has ${labels.length} buttons [${labels.join(", ")}], expected ${expected.buttons.length} [${expected.buttons.join(", ")}]`);
  } else if (!labels.every((label, i) => label.includes(expected.buttons[i]))) {
    fail(
      caseName,
      `footer buttons [${labels.join(", ")}] != expected [${expected.buttons.join(", ")}]`,
    );
  }
  for (const button of data.buttons) {
    if (!button.visible) {
      fail(caseName, `button "${button.label}" is not visible`);
      continue;
    }
    if (button.height < 40 || button.height > 80) {
      fail(
        caseName,
        `button "${button.label}" height ${button.height}px outside [40, 80]px`,
      );
    }
    if (button.width < 30) {
      fail(caseName, `button "${button.label}" width ${button.width}px < 30px`);
    }
  }

  if (failures.some((f) => f.caseName === caseName)) {
    const shot = path.join(
      tmpDir,
      `${caseName.replace(/[^\w.-]+/g, "_")}.png`,
    );
    await page.screenshot({ path: shot }).catch(() => {});
    console.error(`    Screenshot: ${shot}`);
  }
}

async function printServerLogTail(serverLogPath) {
  try {
    const log = await fsp.readFile(serverLogPath, "utf8");
    const lines = log.trimEnd().split("\n");
    console.error(`\n--- server log tail (${serverLogPath}) ---`);
    for (const line of lines.slice(-40)) {
      console.error(line);
    }
  } catch {
    // No log available.
  }
}

await main();
