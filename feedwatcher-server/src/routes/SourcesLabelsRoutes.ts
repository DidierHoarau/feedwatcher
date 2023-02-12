import { count } from "console";
import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SearchItemsData } from "../data/SearchItemsData";
import { SourceLabelsData } from "../data/SourceLabelsData";
import { SourcesData } from "../data/SourcesData";
import { StandardTracer } from "../utils-std-ts/StandardTracer";

export class SourcesLabelsRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.get("/", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceLabels = await SourceLabelsData.listForUser(
        StandardTracer.getSpanFromRequest(req),
        userSession.userId
      );
      return res.status(201).send({ sourceLabels });
    });

    fastify.get("/counts/unread", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const counts = await SourcesData.listCountsForUser(StandardTracer.getSpanFromRequest(req), userSession.userId);
      return res.status(201).send({ counts });
    });

    interface GetSourceLabelItemsRequest extends RequestGenericInterface {
      Params: {
        labelName: string;
      };
    }
    fastify.get<GetSourceLabelItemsRequest>("/:labelName/items", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceItems = await SearchItemsData.listItemsForLabel(
        StandardTracer.getSpanFromRequest(req),
        req.params.labelName,
        userSession.userId
      );
      return res.status(201).send({ sourceItems });
    });
  }
}
