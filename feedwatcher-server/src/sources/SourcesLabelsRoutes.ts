import { FastifyInstance } from "fastify";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";
import { SourcesDataListCountsForUser, SourcesDataListCountsSavedForUser } from "./SourcesData";
import { SourceLabelsDataListForUser } from "./SourceLabelsData";
import { AuthGetUserSession } from "../users/Auth";

export class SourcesLabelsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceLabels = await SourceLabelsDataListForUser(StandardTracerGetSpanFromRequest(req), userSession.userId);
      return res.status(201).send({ sourceLabels });
    });

    fastify.get("/counts/unread", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const counts = await SourcesDataListCountsForUser(StandardTracerGetSpanFromRequest(req), userSession.userId);
      return res.status(201).send({ counts });
    });

    fastify.get("/counts/saved", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const counts = await SourcesDataListCountsSavedForUser(StandardTracerGetSpanFromRequest(req), userSession.userId);
      return res.status(201).send({ counts });
    });
  }
}
