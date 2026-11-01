import axios from "axios";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/504-DockerHubProcessor";

describe("DockerHub processor: per-item identity", () => {
  let getSpy: jest.SpyInstance;

  beforeEach(() => {
    getSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        results: [
          {
            name: "latest",
            full_size: 10,
            tag_last_pushed: "2026-01-02T00:00:00Z",
          },
          {
            name: "1.0",
            full_size: 20,
            tag_last_pushed: "2026-01-01T00:00:00Z",
          },
        ],
      },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns every tag sharing the source URL with a distinct itemId", async () => {
    const source = new Source();
    source.info = { url: "https://hub.docker.com/r/library/nginx" };

    const sourceItems = await processor.fetchLatest(source, null);

    expect(sourceItems).toHaveLength(2);
    expect(sourceItems.map((item: any) => item.info.itemId)).toEqual([
      "latest",
      "1.0",
    ]);
    for (const item of sourceItems) {
      expect(item.url).toBe(source.info.url);
    }
    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});
