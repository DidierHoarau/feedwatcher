import { Source } from "../model/Source";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const processor = require("../../processors-system/601-YahooFinanceProcessor");

describe("YahooFinance processor: Test URL", () => {
  //
  test("URL: Normal", async () => {
    const source = new Source();
    source.info.url = "https://finance.yahoo.com/quote/9988.HK";
    const testResult = await processor.test(source);
    expect(testResult.name).toBeDefined();
    expect(testResult.icon).toBeDefined();
  });

  test("URL: With Parameters", async () => {
    const source = new Source();
    source.info.url = "https://finance.yahoo.com/quote/9988.HK?p=9988.HK&.tsrc=fin-srch";
    const testResult = await processor.test(source);
    expect(testResult.name).toBeDefined();
    expect(testResult.icon).toBeDefined();
  });

  test("URL: Root URL", async () => {
    const source = new Source();
    source.info.url = "https://finance.yahoo.com/quote/";
    const testResult = await processor.test(source);
    expect(testResult).toBeNull();
  });

  test("URL: Invalid URL", async () => {
    const source = new Source();
    source.info.url = "https://awrongurl.con/";
    const testResult = await processor.test(source);
    expect(testResult).toBeNull();
  });
});

describe("YahooFinance processor: Get Items", () => {
  //
  test.only("First Fetch", async () => {
    const source = new Source();
    source.info.url = "https://finance.yahoo.com/quote/9988.HK";
    const sourceItems = await processor.fetchLatest(source, null);
    expect(sourceItems.length).toEqual(1);
  });

  test.only("Second Fetch Before 24 hours", async () => {
    const source = new Source();
    source.info.url = "https://finance.yahoo.com/quote/9988.HK";
    let sourceItems = await processor.fetchLatest(source, null);
    sourceItems = await processor.fetchLatest(source, sourceItems[0]);
    expect(sourceItems.length).toEqual(0);
  });

  test.only("Second Fetch After 24 hours", async () => {
    const source = new Source();
    source.info.url = "https://finance.yahoo.com/quote/9988.HK";
    let sourceItems = await processor.fetchLatest(source, null);
    sourceItems[0].datePublished = new Date(new Date().getTime() - 25 * 60 * 60 * 1000);
    sourceItems = await processor.fetchLatest(source, sourceItems[0]);
    expect(sourceItems.length).toEqual(1);
  });
});
