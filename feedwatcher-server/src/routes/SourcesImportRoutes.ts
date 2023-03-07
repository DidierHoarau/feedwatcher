import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import * as opml from "opml";
import { Logger } from "../utils-std-ts/Logger";
import { Source } from "../model/Source";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Span } from "@opentelemetry/sdk-trace-base";

const logger = new Logger("SourcesImportRoutes");

export class SourcesImportRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.post("/analyze/opml", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await (req as any).file();
        const opmlText = (await data.toBuffer()).toString();
        const opmlData = await opmlLoad(opmlText);
        const sourcesOpml = [];
        await opmlProcessSub(
          StandardTracer.getSpanFromRequest(req),
          opmlData.opml.body.subs,
          "",
          sourcesOpml,
          userSession.userId
        );
        return res.status(200).send({ sources: sourcesOpml });
      } catch (err) {
        logger.error(err);
        return res.status(400).send({ error: "Invalid File" });
      }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function opmlLoad(text: string): Promise<any> {
  return new Promise((resolve, reject) => {
    opml.parse(text, (err, opmlObject) => {
      if (err) {
        reject(err);
      } else {
        resolve(opmlObject);
      }
    });
  });
}

async function opmlProcessSub(
  context: Span,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opmlSub: any[],
  parentFolder: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourcesOpml: any[],
  userId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  for (const feed of opmlSub) {
    if (feed.xmlUrl) {
      const source = new Source();
      source.name = feed.title;
      source.info = { url: feed.xmlUrl };
      source.userId = userId;
      source.labels = [parentFolder];
      sourcesOpml.push(source);
    }
    if (feed.subs) {
      await opmlProcessSub(
        context,
        feed.subs,
        `${parentFolder ? parentFolder + "/" : ""}${feed.title}`,
        sourcesOpml,
        userId
      );
    }
  }
}
