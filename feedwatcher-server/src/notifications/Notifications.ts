import { Span } from "@opentelemetry/sdk-trace-base";
import { OTelLogger, OTelTracer } from "../OTelContext";
import { Config } from "../Config";
import { User } from "../model/User";
import { UsersDataGet, UsersDataList } from "../users/UsersData";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import {
  PushSenderInit,
  PushSenderIsEnabled,
  PushSenderSendToUser,
} from "./PushSender";

const logger = OTelLogger().createModuleLogger("Notifications");

const DIGEST_BODY_MAX_CHARS = 140;
const NEW_ITEMS_BODY_MAX_CHARS = 100;
const NEW_ITEMS_MAX = 20;

export async function NotificationsInit(
  context: Span,
  config: Config
): Promise<void> {
  const span = OTelTracer().startSpan("NotificationsInit", context);
  await PushSenderInit(span, config);
  span.end();
}

// Fires the daily-digest push for one user. Best effort: never throws, so a
// notification failure cannot break summary generation.
export async function NotificationsSendDigestForUser(
  context: Span,
  userId: string,
  summaryMarkdown: string
): Promise<void> {
  const span = OTelTracer().startSpan("NotificationsSendDigestForUser", context);
  try {
    if (!PushSenderIsEnabled()) {
      span.end();
      return;
    }
    if (!summaryMarkdown || summaryMarkdown.trim() === "") {
      span.end();
      return;
    }
    const user = await UsersDataGet(span, userId);
    if (!user || !user.settings || !user.settings.notifications.digest) {
      span.end();
      return;
    }
    const body = digestBodyFromMarkdown(summaryMarkdown);
    await PushSenderSendToUser(span, userId, {
      title: "FeedWatcher daily digest",
      body,
      url: "/",
      tag: "fw-digest",
    });
  } catch (err) {
    logger.error(`Failed to send digest push for user ${userId}`, err, span);
  }
  span.end();
}

// One push per user per scheduler cycle for new unread items, batched behind
// a per-user watermark so a source backfill cannot cause a push storm.
export async function NotificationsCheckNewItems(context: Span): Promise<void> {
  const span = OTelTracer().startSpan("NotificationsCheckNewItems", context);
  try {
    if (!PushSenderIsEnabled()) {
      span.end();
      return;
    }
    const users = await UsersDataList(span);
    for (const user of users) {
      try {
        await NotificationsCheckNewItemsForUser(span, user);
      } catch (err) {
        logger.error(
          `New-item notification check failed for user ${user.id}`,
          err,
          span
        );
      }
    }
  } catch (err) {
    logger.error("New-item notification check failed", err, span);
  }
  span.end();
}

// Private Functions

async function NotificationsCheckNewItemsForUser(
  context: Span,
  user: User
): Promise<void> {
  const span = OTelTracer().startSpan(
    "NotificationsCheckNewItemsForUser",
    context
  );
  const watchMode = user.settings?.notifications?.newItems || "off";
  if (watchMode === "off") {
    span.end();
    return;
  }

  const nowIso = new Date().toISOString();
  const stateRaw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM notification_state WHERE userId = ?",
    [user.id]
  );
  if (stateRaw.length === 0) {
    // First run after opting in: seed the watermark without pushing, so the
    // whole feed history is never blasted as "new".
    await DbUtilsExecSQL(
      span,
      "INSERT INTO notification_state (userId, lastNewItemsAt) VALUES (?, ?)",
      [user.id, nowIso]
    );
    span.end();
    return;
  }
  const lastNewItemsAt = stateRaw[0].lastNewItemsAt;

  const watchedLabels = (user.settings.notifications.newItemsLabels || []).filter(
    (label) => label && label.trim() !== ""
  );
  if (watchMode === "labels" && watchedLabels.length === 0) {
    span.end();
    return;
  }

  const params: any[] = [user.id, lastNewItemsAt];
  let labelFilter = "";
  if (watchMode === "labels") {
    labelFilter =
      "AND EXISTS (SELECT 1 FROM sources_labels sl WHERE sl.sourceId = s.id AND sl.name IN (" +
      watchedLabels.map(() => "?").join(",") +
      "))";
    params.push(...watchedLabels);
  }
  const itemsRaw = await DbUtilsQuerySQL(
    span,
    "SELECT si.id, si.title, si.datePublished FROM sources_items si " +
      "JOIN sources s ON si.sourceId = s.id " +
      "WHERE s.userId = ? AND si.status = 'unread' AND si.datePublished > ? " +
      labelFilter +
      " ORDER BY si.datePublished DESC LIMIT " + NEW_ITEMS_MAX,
    params
  );

  if (itemsRaw.length > 0) {
    const newest = itemsRaw
      .map((item: any) => item.datePublished)
      .sort()
      .reverse()[0];
    const firstTitle = String(itemsRaw[0].title || "").substring(
      0,
      NEW_ITEMS_BODY_MAX_CHARS
    );
    await PushSenderSendToUser(span, user.id, {
      title: "FeedWatcher",
      body: `${itemsRaw.length} new item(s) — ${firstTitle}`,
      url: "/sources",
      tag: "fw-items",
    });
    await DbUtilsExecSQL(
      span,
      "INSERT INTO notification_state (userId, lastNewItemsAt) VALUES (?, ?) " +
        "ON CONFLICT(userId) DO UPDATE SET lastNewItemsAt = excluded.lastNewItemsAt",
      [user.id, newest]
    );
  }
  span.end();
}

function digestBodyFromMarkdown(summaryMarkdown: string): string {
  const lines = summaryMarkdown.split("\n");
  let line = "";
  for (const candidate of lines) {
    if (candidate.trim() !== "") {
      line = candidate;
      break;
    }
  }
  line = line.replace(/^[#\->\s]+/, "").replace(/\s+/g, " ").trim();
  if (line.length > DIGEST_BODY_MAX_CHARS) {
    line = line.substring(0, DIGEST_BODY_MAX_CHARS) + "…";
  }
  return line;
}
