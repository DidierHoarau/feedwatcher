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
 * actions bar while the advanced filters are closed.
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

    for (const viewport of VIEWPORTS) {
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
      });
      await runListPageState(page, base, authHeaders, seedItems, viewport, tmpDir);
      for (const state of STATES) {
        await runState(page, base, authHeaders, seedItems, state, viewport, tmpDir);
      }
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
