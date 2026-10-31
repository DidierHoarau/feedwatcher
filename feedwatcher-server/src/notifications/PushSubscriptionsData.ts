import { Span } from "@opentelemetry/sdk-trace";
import { v4 as uuidv4 } from "uuid";
import { OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

// An endpoint identifies a browser installation. Re-subscribing with an
// endpoint the instance already knows (same browser, new keys, or another user
// on a shared profile) reassigns the row to the new user instead of failing on
// the unique endpoint index: the previous user stops receiving pushes on that
// browser. Unsubscribing, in contrast, is scoped to the calling user and never
// removes another user's row.
export async function PushSubscriptionsDataUpsert(
  context: Span,
  userId: string,
  subscription: PushSubscription
): Promise<void> {
  const span = OTelTracer().startSpan("PushSubscriptionsDataUpsert", context);
  const existing = await DbUtilsQuerySQL(
    span,
    "SELECT id FROM push_subscriptions WHERE endpoint = ?",
    [subscription.endpoint]
  );
  if (existing.length > 0) {
    await DbUtilsExecSQL(
      span,
      "UPDATE push_subscriptions SET userId = ?, p256dh = ?, auth = ? WHERE endpoint = ?",
      [userId, subscription.keys.p256dh, subscription.keys.auth, subscription.endpoint]
    );
  } else {
    await DbUtilsExecSQL(
      span,
      "INSERT INTO push_subscriptions (id,userId,endpoint,p256dh,auth,dateCreated) VALUES (?,?,?,?,?,?)",
      [
        uuidv4(),
        userId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        new Date().toISOString(),
      ]
    );
  }
  span.end();
}

export async function PushSubscriptionsDataDelete(
  context: Span,
  userId: string,
  endpoint: string
): Promise<void> {
  const span = OTelTracer().startSpan("PushSubscriptionsDataDelete", context);
  await DbUtilsExecSQL(
    span,
    "DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?",
    [userId, endpoint]
  );
  span.end();
}

export async function PushSubscriptionsDataListForUser(
  context: Span,
  userId: string
): Promise<PushSubscription[]> {
  const span = OTelTracer().startSpan(
    "PushSubscriptionsDataListForUser",
    context
  );
  const raw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM push_subscriptions WHERE userId = ?",
    [userId]
  );
  span.end();
  return raw.map((row: any) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }));
}
