import { SourcesData } from "../data/SourcesData";
import { Logger } from "../utils-std-ts/Logger";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { Timeout } from "../utils-std-ts/Timeout";
import { RssProcessor } from "./RssProcessor";

const logger = new Logger("Scheduler");

export class Scheduler {
  //
  public static async start() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const span = StandardTracer.startSpan("Scheduler_start");
      logger.info("Start scanning rule");
      const sources = await SourcesData.listAll(span);
      for (const source of sources) {
        if (RssProcessor.test(span, source)) {
          const newSourceItems = await RssProcessor.fetchLatest(span, source);
          console.log(newSourceItems);
        }
      }
      span.end();
      await Timeout.wait(10000);
    }
  }
}
