import { Source } from "../model/Source";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const processor = require("../../processors-system/505-WikipediaProcessor");

describe("Wikipedia processor: Test URL", () => {
  //
  test("URL: Normal", async () => {
    const source = new Source();
    source.info.url = "https://en.wikipedia.org/wiki/Earth";
    const testResult = await processor.test(source);
    expect(testResult.name).toBeDefined();
    expect(testResult.icon).toBeDefined();
  });

  test("URL: Mobile", async () => {
    const source = new Source();
    source.info.url = "https://en.m.wikipedia.org/wiki/Earth";
    const testResult = await processor.test(source);
    expect(testResult.name).toBeDefined();
    expect(testResult.icon).toBeDefined();
  });

  test("URL: Root URL", async () => {
    const source = new Source();
    source.info.url = "https://en.wikipedia.org/";
    const testResult = await processor.test(source);
    expect(testResult).toBeNull();
  });

  test("URL: Invalid URL", async () => {
    const source = new Source();
    source.info.url = "https://hellowikipedia.org/";
    const testResult = await processor.test(source);
    expect(testResult).toBeNull();
  });
});
