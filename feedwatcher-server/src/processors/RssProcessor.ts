import { Span } from "@opentelemetry/sdk-trace-base";
import { Source } from "../model/Source";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import * as Parser from "rss-parser";
import { SourceItem } from "../model/SourceItem";

export class RssProcessor {
  //
  public static async test(context: Span, source: Source): Promise<boolean> {
    const span = StandardTracer.startSpan("RssProcessor_test", context);
    const parser = new Parser();
    const feed = await parser.parseURL(source.info.url);
    let valid = false;
    if (feed.title) {
      valid = true;
    }
    span.end();
    return valid;
  }

  public static async fetchLatest(context: Span, source: Source): Promise<SourceItem[]> {
    const span = StandardTracer.startSpan("RssProcessor_fetchLatest", context);
    const parser = new Parser();
    const feed = await parser.parseURL(source.info.url);
    let valid = false;
    if (feed.title) {
      valid = true;
    }
    const sourceItems: SourceItem[] = [];
    feed.items.forEach((item) => {
      const sourceItem = new SourceItem();
      sourceItem.url = item.link;
      sourceItem.title = item.title;
      sourceItem.contemt = item.content;
      sourceItem.date = new Date(item.pubDate);
      sourceItems.push(sourceItem);
    });
    span.end();
    return sourceItems;
  }
}
