import { Span } from "@opentelemetry/sdk-trace-base";
import { v4 as uuidv4 } from "uuid";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";
import { OTelTracer } from "../OTelContext";
import { SourceItemsDataGetForUser } from "./SourceItemsData";

export interface PodcastPlaybackPosition {
  positionSeconds: number;
  durationSeconds: number;
  dateUpdated: string;
}

export async function PodcastPlaybackDataGetForItem(
  context: Span,
  itemId: string,
  userId: string,
): Promise<PodcastPlaybackPosition | null> {
  const span = OTelTracer().startSpan("PodcastPlaybackDataGetForItem", context);
  const playbackRaw = await DbUtilsQuerySQL(
    span,
    "SELECT positionSeconds, durationSeconds, dateUpdated FROM podcast_playback WHERE itemId = ? AND userId = ?",
    [itemId, userId],
  );
  span.end();
  if (playbackRaw.length === 0) {
    return null;
  }
  return {
    positionSeconds: Number(playbackRaw[0].positionSeconds) || 0,
    durationSeconds: Number(playbackRaw[0].durationSeconds) || 0,
    dateUpdated: playbackRaw[0].dateUpdated,
  };
}

export async function PodcastPlaybackDataListForItems(
  context: Span,
  userId: string,
  itemIds: string[],
): Promise<Map<string, { positionSeconds: number; durationSeconds: number }>> {
  const span = OTelTracer().startSpan(
    "PodcastPlaybackDataListForItems",
    context,
  );
  const playbackByItemId = new Map<
    string,
    { positionSeconds: number; durationSeconds: number }
  >();
  if (itemIds.length === 0) {
    span.end();
    return playbackByItemId;
  }
  const placeholders = itemIds.map(() => "?").join(",");
  const playbackRaw = await DbUtilsQuerySQL(
    span,
    `SELECT itemId, positionSeconds, durationSeconds FROM podcast_playback WHERE userId = ? AND itemId IN (${placeholders})`,
    [userId, ...itemIds],
  );
  for (const playback of playbackRaw) {
    playbackByItemId.set(playback.itemId, {
      positionSeconds: Number(playback.positionSeconds) || 0,
      durationSeconds: Number(playback.durationSeconds) || 0,
    });
  }
  span.end();
  return playbackByItemId;
}

export async function PodcastPlaybackDataSetForItem(
  context: Span,
  itemId: string,
  userId: string,
  positionSeconds: number,
  durationSeconds: number,
): Promise<void> {
  const span = OTelTracer().startSpan("PodcastPlaybackDataSetForItem", context);
  // Ownership guard: positions are per-user, an item the user does not own is
  // never saved (the route maps this to 404 via SourceItemsDataGetForUser).
  const sourceItem = await SourceItemsDataGetForUser(span, itemId, userId);
  if (!sourceItem) {
    span.end();
    return;
  }
  const existingRaw = await DbUtilsQuerySQL(
    span,
    "SELECT id FROM podcast_playback WHERE itemId = ? AND userId = ?",
    [itemId, userId],
  );
  if (existingRaw.length > 0) {
    await DbUtilsExecSQL(
      span,
      "UPDATE podcast_playback " +
        " SET positionSeconds = ?, durationSeconds = ?, dateUpdated = ? " +
        " WHERE itemId = ? AND userId = ?",
      [
        Math.round(positionSeconds),
        Math.round(durationSeconds),
        new Date().toISOString(),
        itemId,
        userId,
      ],
    );
  } else {
    await DbUtilsExecSQL(
      span,
      "INSERT INTO podcast_playback (id, itemId, userId, positionSeconds, durationSeconds, dateUpdated) VALUES (?, ?, ?, ?, ?, ?)",
      [
        uuidv4(),
        itemId,
        userId,
        Math.round(positionSeconds),
        Math.round(durationSeconds),
        new Date().toISOString(),
      ],
    );
  }
  span.end();
}
