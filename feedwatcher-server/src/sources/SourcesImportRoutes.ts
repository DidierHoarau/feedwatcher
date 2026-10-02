import { FastifyInstance } from "fastify";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { find } from "lodash";
import { Source } from "../model/Source";
import { Span } from "@opentelemetry/sdk-trace-base";
import { SourceLabelsDataListForUser } from "./SourceLabelsData";
import { AuthGetUserSession } from "../users/Auth";
import { OTelLogger, OTelRequestSpan } from "../OTelContext";

const logger = OTelLogger().createModuleLogger("SourcesImportRoutes");

const opmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  isArray: (name) => name === "outline",
});

const opmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressEmptyNode: true,
});

export class SourcesImportRoutes {
  //
  public async getRoutes(fastify: FastifyInstance): Promise<void> {
    //
    fastify.post("/analyze/opml", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      try {
        const data = await (req as any).file();
        const opmlText = (await data.toBuffer()).toString();
        const opmlData = opmlParser.parse(opmlText);
        if (!opmlData?.opml?.body) {
          return res.status(400).send({ error: "Invalid File" });
        }
        const sourcesOpml = [];
        await opmlProcessSub(
          OTelRequestSpan(req),
          opmlData.opml.body.outline || [],
          "",
          sourcesOpml,
          userSession.userId
        );
        return res.status(200).send({ sources: sourcesOpml });
      } catch (err) {
        logger.error("Error Importing OPML", err, OTelRequestSpan(req));
        return res.status(400).send({ error: "Invalid File" });
      }
    });

    fastify.get("/export/opml", async (req, res) => {
      const userSession = await AuthGetUserSession(req);
      if (!userSession.isAuthenticated) {
        return res.status(403).send({ error: "Access Denied" });
      }
      const sourceLabels = await SourceLabelsDataListForUser(
        OTelRequestSpan(req),
        userSession.userId
      );
      const sourcesOutlines = {
        opml: {
          head: { title: "Feedwatcher Source Export" },
          body: { outline: [] },
        },
      };
      for (const source of sourceLabels) {
        const sourceLabel = source as any;
        const newOutline: any = {
          "@_text": sourceLabel.sourceName,
          "@_type": sourceLabel.sourceInfo.icon,
          "@_url": sourceLabel.sourceInfo.url,
        };
        if (newOutline["@_type"] === "rss") {
          newOutline["@_xmlUrl"] = sourceLabel.sourceInfo.url;
        }
        if (!sourceLabel.labelName) {
          sourcesOutlines.opml.body.outline.push(newOutline);
        } else {
          let parentSub = find(sourcesOutlines.opml.body.outline, {
            "@_title": sourceLabel.labelName,
          });
          if (!parentSub) {
            parentSub = { "@_title": sourceLabel.labelName, outline: [] };
            sourcesOutlines.opml.body.outline.push(parentSub as any);
          }
          parentSub.outline.push(newOutline);
        }
      }
      res.header("Content-Type", "text/x-opml; charset=utf-8");
      res.header(
        "Content-Disposition",
        'attachment; filename="feedwatcher.opml"'
      );
      res.send(opmlBuilder.build(sourcesOutlines));
    });
  }
}

async function opmlProcessSub(
  // oxlint-disable-next-line only-used-in-recursion
  context: Span,
  outlines: any[],
  parentFolder: string,
  sourcesOpml: any[],
  userId: string
): Promise<any> {
  for (const feed of outlines) {
    const childOutlines = feed.outline || [];
    const feedUrl = feed.xmlUrl || feed.url;
    if (feedUrl) {
      const source = new Source();
      source.name = feed.text || feed.title;
      source.info = { url: feedUrl };
      source.userId = userId;
      source.labels = [parentFolder];
      sourcesOpml.push(source);
    }
    if (childOutlines.length > 0) {
      await opmlProcessSub(
        context,
        childOutlines,
        `${parentFolder ? parentFolder + "/" : ""}${feed.title || feed.text}`,
        sourcesOpml,
        userId
      );
    }
  }
}
