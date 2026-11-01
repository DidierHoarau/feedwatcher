import { FastifyInstance, RequestGenericInterface } from "fastify";
import { OTelRequestSpan } from "../OTelContext";
import { AuthGetUserSession } from "../users/Auth";
import { UrlSafetyValidate } from "../utils-std-ts/UrlSafety";
import {
  PushSubscription,
  PushSubscriptionsDataDelete,
  PushSubscriptionsDataUpsert,
} from "./PushSubscriptionsData";

export class PushRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    interface PostSubscribe extends RequestGenericInterface {
      Body: {
        endpoint: string;
        keys: {
          p256dh: string;
          auth: string;
        };
      };
    }
    fastify.post<PostSubscribe>("/subscribe", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body || typeof req.body.endpoint !== "string") {
        return res.status(400).send({ error: "Missing: Endpoint" });
      }
      if (!req.body.endpoint.startsWith("https://")) {
        return res.status(400).send({ error: "Invalid: Endpoint" });
      }
      try {
        // Push endpoints are public HTTPS services: never allow private or
        // loopback targets, even when the server allows trusted private feeds.
        await UrlSafetyValidate(req.body.endpoint, {
          allowPrivateNetwork: false,
        });
      } catch {
        return res.status(400).send({ error: "Invalid: Endpoint" });
      }
      const keys = req.body.keys;
      if (
        !keys ||
        typeof keys.p256dh !== "string" ||
        keys.p256dh === "" ||
        typeof keys.auth !== "string" ||
        keys.auth === ""
      ) {
        return res.status(400).send({ error: "Missing: Keys" });
      }
      const subscription: PushSubscription = {
        endpoint: req.body.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      };
      await PushSubscriptionsDataUpsert(
        OTelRequestSpan(req),
        userSession.userId,
        subscription
      );
      return res.status(201).send({});
    });

    interface PostUnsubscribe extends RequestGenericInterface {
      Body: {
        endpoint: string;
      };
    }
    fastify.post<PostUnsubscribe>("/unsubscribe", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      if (!req.body || typeof req.body.endpoint !== "string") {
        return res.status(400).send({ error: "Missing: Endpoint" });
      }
      await PushSubscriptionsDataDelete(
        OTelRequestSpan(req),
        userSession.userId,
        req.body.endpoint
      );
      return res.status(201).send({});
    });
  }
}
