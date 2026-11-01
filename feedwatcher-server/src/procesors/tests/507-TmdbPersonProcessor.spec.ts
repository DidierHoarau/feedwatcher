import axios from "axios";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/507-TmdbPersonProcessor";

describe("TMDB person processor: per-item identity", () => {
  const previousApiKey = process.env.FEEDWATCHER_TMDB_API_KEY;
  let getSpy: jest.SpyInstance;

  beforeAll(() => {
    process.env.FEEDWATCHER_TMDB_API_KEY = "test-api-key";
  });

  afterAll(() => {
    if (previousApiKey === undefined) {
      delete process.env.FEEDWATCHER_TMDB_API_KEY;
    } else {
      process.env.FEEDWATCHER_TMDB_API_KEY = previousApiKey;
    }
  });

  beforeEach(() => {
    getSpy = jest.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        cast: [
          {
            id: 11,
            title: "Cast Movie",
            original_title: "Cast Movie",
            release_date: "2020-01-01",
            character: "Hero",
            overview: "",
          },
        ],
        crew: [
          {
            id: 22,
            title: "Crew Movie",
            original_title: "Crew Movie",
            release_date: "2021-01-01",
            job: "Director",
            overview: "",
          },
        ],
      },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("gives cast and crew credits distinct itemIds", async () => {
    const source = new Source();
    source.info = { url: "https://www.themoviedb.org/person/123-john-doe" };

    const sourceItems = await processor.fetchLatest(source, null);

    expect(sourceItems).toHaveLength(2);
    expect(sourceItems.map((item: any) => item.info.itemId)).toEqual([
      "cast:11",
      "crew:22",
    ]);
    for (const item of sourceItems) {
      expect(item.url).toBe(source.info.url);
    }
    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});
