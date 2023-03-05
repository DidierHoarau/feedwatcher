import { FastifyInstance, RequestGenericInterface } from "fastify";
import { Auth } from "../data/Auth";
import * as opml from "opml";
import { Logger } from "../utils-std-ts/Logger";
import { Source } from "../model/Source";
import { Processors } from "../procesors/processors";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Span } from "@opentelemetry/sdk-trace-base";

const logger = new Logger("SourcesImportRoutes");

export class SourcesImportRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.post("/opml", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await (req as any).file();
        const opmlText = (await data.toBuffer()).toString();
        const opmlData = await opmlLoad(opmlText);
        const summaryImport = {
          imported: 0,
          ignored: 0,
        };
        await opmlProcessSub(
          StandardTracer.getSpanFromRequest(req),
          opmlData.opml.body.subs,
          "",
          summaryImport,
          userSession.userId
        );
        console.log(summaryImport);
      } catch (err) {
        logger.error(err);
        return res.status(400).send({ error: "Invalid File" });
      }
      return res.status(201).send({});
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
  opmlSub: any[],
  parentFolder: string,
  summaryImport: any,
  userId: string
): Promise<any> {
  for (const feed of opmlSub) {
    if (feed.xmlUrl) {
      console.log(feed);
      const source = new Source();
      source.name = feed.title;
      source.info = { url: feed.xmlUrl };
      source.userId = userId;
      await Processors.checkSource(context, source);
      if (source.info.processorPath) {
        summaryImport.imported++;
      } else {
        summaryImport.ignored++;
      }
    }
    if (feed.subs) {
      await opmlProcessSub(context, feed.subs, parentFolder + "/" + feed.title, summaryImport, userId);
    }
  }
}
