import axios from "axios";
import * as dns from "dns";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/505-WikipediaProcessor";

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

describe("Wikipedia processor: Get Items", () => {
  //
  test("Page: Earth", async () => {
    const source = new Source();
    source.info.url = "https://en.wikipedia.org/wiki/Earth";
    const sourceItems = await processor.fetchLatest(source, null);
    expect(sourceItems.length).toBeGreaterThan(0);
  });
});

describe("Wikipedia processor: rejected attacker-style URLs", () => {
  let axiosSpy: jest.SpyInstance;

  beforeEach(() => {
    jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    axiosSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ title: "Earth" }),
    } as any);
  });

  afterEach(() => {
    axiosSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test.each([
    "https://attacker.com/.wikipedia.org/wiki/Earth",
    "https://en.wikipedia.org.evil.com/wiki/Earth",
    "https://en.wikipedia.org/admin",
    "https://en.wikipedia.org/wiki/",
    "ftp://en.wikipedia.org/wiki/Earth",
    "https://user:pass@en.wikipedia.org/wiki/Earth",
  ])("returns null without fetching for %s", async (url) => {
    const source = new Source();
    source.info.url = url;

    await expect(processor.test(source)).resolves.toBeNull();
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test("fetches the REST endpoint only for the validated language", async () => {
    const source = new Source();
    source.info.url = "https://en.wikipedia.org/wiki/Earth";

    await expect(processor.test(source)).resolves.toEqual({
      name: "Earth",
      icon: "wikipedia",
    });
    expect(axiosSpy).toHaveBeenCalledTimes(1);
    expect(axiosSpy.mock.calls[0][0]).toBe(
      "https://en.wikipedia.org/w/rest.php/v1/page/Earth/bare"
    );
  });

  test("rejects fetchLatest for an attacker-style URL", async () => {
    const source = new Source();
    source.info.url = "https://attacker.com/.wikipedia.org/wiki/Earth";

    await expect(processor.fetchLatest(source, null)).rejects.toThrow(
      "Invalid Wikipedia URL"
    );
    expect(axiosSpy).not.toHaveBeenCalled();
  });
});

describe("Wikipedia processor: hidden revisions", () => {
  beforeEach(() => {
    jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    jest.spyOn(axios, "get").mockImplementation(async (url: string) => {
      if (String(url).includes("/history")) {
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          data: JSON.stringify({
            revisions: [
              {
                id: 1,
                timestamp: "2026-01-01T00:00:00Z",
                comment: "initial",
                user: { name: "Alice" },
                delta: 1,
                size: 10,
              },
              {
                id: 2,
                timestamp: "2026-01-02T00:00:00Z",
                comment: null,
                user: null,
                delta: 2,
                size: 12,
              },
              {
                id: null,
                timestamp: "2026-01-03T00:00:00Z",
                comment: "deleted",
                user: null,
                delta: 0,
                size: 12,
              },
            ],
          }),
        } as any;
      }
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        data: JSON.stringify({ title: "Earth" }),
      } as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns revisions with suppressed comment/user and skips unidentified ones", async () => {
    const source = new Source();
    source.info.url = "https://en.wikipedia.org/wiki/Earth";

    const sourceItems = await processor.fetchLatest(source, null);

    expect(sourceItems).toHaveLength(2);
    expect(sourceItems.map((item: any) => item.info.itemId)).toEqual([1, 2]);
    expect(sourceItems[1].content).toContain("(hidden user)");
    expect(sourceItems[1].url).toBe(source.info.url);
  });
});
