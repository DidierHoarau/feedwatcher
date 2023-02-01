import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import { SourceLabelsData } from "../data/SourceLabelsData";
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
      const sourceItems = await SourceLabelsData.listItemsForLabel(
        StandardTracer.getSpanFromRequest(req),
        req.params.labelName,
        userSession.userId
      );
      return res.status(201).send({ sourceItems });
    });
  }
}
