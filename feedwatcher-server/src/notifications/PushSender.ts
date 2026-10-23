import { Span } from "@opentelemetry/sdk-trace-base";
import * as webpush from "web-push";
import { Config } from "../Config";
import { OTelLogger, OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
  DbUtilsWithLock,
} from "@devopsplaybook.io/common-utils";
import {
  PushSubscriptionsDataDelete,
  PushSubscriptionsDataListForUser,
} from "./PushSubscriptionsData";

const logger = OTelLogger().createModuleLogger("PushSender");

let enabled = false;
let publicKey = "";

function metadataUpsert(span: Span, type: string, value: string, existing: boolean) {
  if (existing) {
    return DbUtilsExecSQL(
      span,
      "UPDATE metadata SET value = ? WHERE type = ?",
      [value, type]
    );
  }
  return DbUtilsExecSQL(
    span,
    "INSERT INTO metadata (type, value, dateCreated) VALUES (?, ?, ?)",
    [type, value, new Date().toISOString()]
  );
}

// VAPID key resolution (same instance-local secret pattern as the JWT key in
// Auth.ts): config keys win and are synced into metadata; otherwise keys
// persisted in metadata are reused; otherwise a pair is generated and stored.
export async function PushSenderInit(
  context: Span,
  config: Config
): Promise<void> {
  const span = OTelTracer().startSpan("PushSenderInit", context);
  enabled = false;
  publicKey = "";
  try {
    // The lock-name union in @devopsplaybook.io/common-utils is closed and maps
    // to fixed Postgres advisory keys; auth_token guards instance-local secrets
    // persisted in metadata (same resource class as VAPID keys).
    await DbUtilsWithLock("auth_token", async () => {
      const metadataRaw = await DbUtilsQuerySQL(
        span,
        "SELECT * FROM metadata WHERE type='vapid_public_key' OR type='vapid_private_key'"
      );
      const storedPublic = metadataRaw.find(
        (row: any) => row.type === "vapid_public_key"
      )?.value;
      const storedPrivate = metadataRaw.find(
        (row: any) => row.type === "vapid_private_key"
      )?.value;

      const configHasKeys =
        config.VAPID_PUBLIC_KEY !== "" && config.VAPID_PRIVATE_KEY !== "";

      let publicKeyToUse = "";
      let privateKeyToUse = "";
      if (configHasKeys) {
        publicKeyToUse = config.VAPID_PUBLIC_KEY;
        privateKeyToUse = config.VAPID_PRIVATE_KEY;
        if (storedPublic !== publicKeyToUse) {
          await metadataUpsert(span, "vapid_public_key", publicKeyToUse, !!storedPublic);
        }
        if (storedPrivate !== privateKeyToUse) {
          await metadataUpsert(span, "vapid_private_key", privateKeyToUse, !!storedPrivate);
        }
      } else if (storedPublic && storedPrivate) {
        publicKeyToUse = storedPublic;
        privateKeyToUse = storedPrivate;
      } else {
        const generated = webpush.generateVAPIDKeys();
        publicKeyToUse = generated.publicKey;
        privateKeyToUse = generated.privateKey;
        await metadataUpsert(span, "vapid_public_key", publicKeyToUse, !!storedPublic);
        await metadataUpsert(span, "vapid_private_key", privateKeyToUse, !!storedPrivate);
      }

      webpush.setVapidDetails(
        config.VAPID_SUBJECT || "mailto:feedwatcher@localhost",
        publicKeyToUse,
        privateKeyToUse
      );
      enabled = true;
      publicKey = publicKeyToUse;
    });
  } catch (err) {
    enabled = false;
    publicKey = "";
    logger.error(`Push notifications disabled: ${err.message}`, err, span);
  }
  logger.info(`Push notifications ${enabled ? "enabled" : "disabled"}`);
  span.end();
}

export function PushSenderIsEnabled(): boolean {
  return enabled;
}

export function PushSenderGetPublicKey(): string {
  return publicKey;
}

// Sends a payload to every subscription of a user. Best effort: expired
// endpoints (404/410) are pruned, any other per-subscription failure is
// logged and skipped; this function never throws.
export async function PushSenderSendToUser(
  context: Span,
  userId: string,
  payload: any
): Promise<number> {
  if (!enabled) {
    return 0;
  }
  const span = OTelTracer().startSpan("PushSenderSendToUser", context);
  let sent = 0;
  try {
    const subscriptions = await PushSubscriptionsDataListForUser(span, userId);
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          subscription as any,
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscriptionsDataDelete(span, userId, subscription.endpoint);
          logger.info(`Removed expired push subscription for user ${userId}`);
        } else {
          logger.warn(`Push send failed for user ${userId}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`Push send failed for user ${userId}`, err, span);
  }
  span.end();
  return sent;
}
