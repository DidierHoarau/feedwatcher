import axios from "axios";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/602-CoinGeckoProcessor";

describe("CoinGecko processor: per-item identity", () => {
  beforeEach(() => {
    jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      data: { bitcoin: { usd: 100 } },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("dates the daily price and dedupes it on its timestamp", async () => {
    const source = new Source();
    source.info = { url: "https://www.coingecko.com/en/coins/bitcoin" };

    const sourceItems = await processor.fetchLatest(source, null);

    expect(sourceItems).toHaveLength(1);
    expect(sourceItems[0].info).toEqual({
      price: 100,
      itemId: sourceItems[0].datePublished.toISOString(),
    });
    expect(sourceItems[0].url).toBe(source.info.url);
  });

  test("returns no item when the last price is less than a day old", async () => {
    const source = new Source();
    source.info = { url: "https://www.coingecko.com/en/coins/bitcoin" };
    const lastSourceItemSaved = {
      datePublished: new Date(),
      info: { price: 99 },
    };

    const sourceItems = await processor.fetchLatest(
      source,
      lastSourceItemSaved as any,
    );

    expect(sourceItems).toEqual([]);
  });
});
