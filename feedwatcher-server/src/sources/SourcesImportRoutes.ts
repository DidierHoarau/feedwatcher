import { FastifyInstance } from "fastify";
import { Auth } from "../users/Auth";
import * as opml from "opml";
import { find } from "lodash";
import { Logger } from "../utils-std-ts/Logger";
import { Source } from "../model/Source";
import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceLabelsData } from "../sources/SourceLabelsData";
import { StandardTracerGetSpanFromRequest } from "../utils-std-ts/StandardTracer";

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
          StandardTracerGetSpanFromRequest(req),
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

    fastify.get("/export/opml", async (req, res) => {
      const userSession = await Auth.getUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceLabels = await SourceLabelsData.listForUser(
        StandardTracerGetSpanFromRequest(req),
        userSession.userId
      );
      const sourcesOutlines = { opml: { head: { title: "Feedwatcher Source Export" }, body: { subs: [] } } };
      for (const source of sourceLabels) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sourceLabel = source as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newOutline: any = {
          text: sourceLabel.sourceName,
          type: sourceLabel.sourceInfo.icon,
          url: sourceLabel.sourceInfo.url,
        };
        if (newOutline.type === "rss") {
          newOutline.xmlUrl = sourceLabel.sourceInfo.url;
        }
        if (!sourceLabel.labelName) {
          sourcesOutlines.opml.body.subs.push(newOutline);
        } else {
          let parentSub = find(sourcesOutlines.opml.body.subs, { title: sourceLabel.labelName });
          if (!parentSub) {
            parentSub = { title: sourceLabel.labelName, subs: [] };
            sourcesOutlines.opml.body.subs.push(parentSub);
          }
          parentSub.subs.push(newOutline);
        }
      }
      res.header("Content-Disposition", "attachment; filename=data.opml");
      res.header("Content-Type", "text/plain");
      res.send(opml.stringify(sourcesOutlines));
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
    if (feed.xmlUrl || feed.url) {
      const source = new Source();
      source.name = feed.text;
      source.info = { url: feed.xmlUrl ? feed.xmlUrl : feed.url };
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
