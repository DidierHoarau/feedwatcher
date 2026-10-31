import { Span } from "@opentelemetry/sdk-trace";
import {
  DbUtilsExecSQL,
  DbUtilsGetDatabase,
  DbUtilsInit,
  DbUtilsQuerySQL,
  DbUtilsSetOTel,
} from "@devopsplaybook.io/common-utils";
import { StandardTracer } from "@devopsplaybook.io/otel-utils";
import * as fs from "fs-extra";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { Config } from "../../Config";
import { Source } from "../../model/Source";
import { OTelLogger, OTelSetTracer, OTelTracer } from "../../OTelContext";
import { ProcessorsFetchSourceItems, ProcessorsInit } from "../Processors";

const SQL_DIR = path.join(__dirname, "..", "..", "..", "sql");
const PROCESSORS_SYSTEM_DIR = path.join(__dirname, "..", "..", "..", "processors-system");

const otelBootstrapConfig = new Config();
OTelSetTracer(new StandardTracer(otelBootstrapConfig));
DbUtilsSetOTel(OTelTracer(), OTelLogger());

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Local RSS Feed</title>
    <item>
      <title>RSS Item A</title>
      <link>https://example.com/rss-a</link>
      <guid>https://example.com/rss-a</guid>
      <pubDate>Wed, 01 Oct 2025 12:00:00 GMT</pubDate>
      <description>A</description>
    </item>
    <item>
      <title>RSS Item B</title>
      <link>https://example.com/rss-b</link>
      <guid>https://example.com/rss-b</guid>
      <pubDate>Thu, 02 Oct 2025 12:00:00 GMT</pubDate>
      <description>B</description>
    </item>
  </channel>
</rss>`;

const PODCAST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Local Podcast</title>
    <item>
      <title>Episode 1</title>
      <link>https://example.com/episode-1</link>
      <guid>https://example.com/episode-1</guid>
      <pubDate>Wed, 01 Oct 2025 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/episode-1.mp3" type="audio/mpeg" length="1"/>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Local Atom Feed</title>
  <updated>2025-10-02T12:00:00Z</updated>
  <entry>
    <title>Atom Item A</title>
    <link href="https://example.com/atom-a"/>
    <id>https://example.com/atom-a</id>
    <updated>2025-10-01T12:00:00Z</updated>
    <summary>A</summary>
  </entry>
</feed>`;

interface RequestRecord {
  url: string;
  headers: http.IncomingHttpHeaders;
}

let tempDir: string;
let processorsUserDir: string;
let server: http.Server;
let baseUrl: string;
let requests: RequestRecord[];
let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
let span: Span;

function send(res: http.ServerResponse, status: number, headers: any, body = ""): void {
  res.writeHead(status, headers);
  res.end(body);
}

beforeAll(async () => {
  processorsUserDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-fetch-user-"));
  const config = new Config();
  config.PROCESSORS_USER = processorsUserDir;
  config.PROCESSORS_SYSTEM = PROCESSORS_SYSTEM_DIR;
  config.SOURCE_ALLOW_PRIVATE_NETWORK = true;
  await ProcessorsInit(undefined, config);
});

afterAll(() => {
  fs.removeSync(processorsUserDir);
});

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "feedwatcher-fetch-"));
  const config = new Config();
  config.DATA_DIR = tempDir;
  config.DATABASE_TYPE = "sqlite";
  span = OTelTracer().startSpan("test");
  await DbUtilsInit(span, config, SQL_DIR);

  requests = [];
  handler = (_req, res) => send(res, 404, {});
  server = http.createServer((req, res) => {
    requests.push({ url: String(req.url), headers: req.headers });
    handler(req, res);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address() as any;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const db = DbUtilsGetDatabase();
  if (db && typeof db.close === "function") {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  fs.removeSync(tempDir);
});

async function createSource(sourceId: string, url: string): Promise<Source> {
  const source = new Source();
  source.id = sourceId;
  source.userId = "user-1";
  source.name = "Test Source";
  source.info = { url };
  await DbUtilsExecSQL(
    span,
    "INSERT INTO sources (id, userId, name, info) VALUES (?, ?, ?, ?)",
    [sourceId, source.userId, source.name, JSON.stringify(source.info)],
  );
  return source;
}

async function reloadSource(sourceId: string): Promise<Source> {
  const rows = await DbUtilsQuerySQL(span, "SELECT * FROM sources WHERE id = ?", [
    sourceId,
  ]);
  const source = new Source();
  source.id = rows[0].id;
  source.userId = rows[0].userId;
  source.name = rows[0].name;
  source.info = JSON.parse(rows[0].info);
  return source;
}

async function countItems(sourceId: string): Promise<number> {
  const rows = await DbUtilsQuerySQL(
    span,
    "SELECT COUNT(*) as count FROM sources_items WHERE sourceId = ?",
    [sourceId],
  );
  return rows[0].count;
}

async function getFetchState(sourceId: string): Promise<any> {
  const rows = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM sources_fetch_state WHERE sourceId = ?",
    [sourceId],
  );
  return rows[0] || null;
}

describe("ProcessorsFetchSourceItems request amplification", () => {
  test("RSS source: one GET per cycle and conditional GET on the second", async () => {
    handler = (req, res) => {
      if (req.url !== "/feed.xml") {
        return send(res, 404, {});
      }
      if (req.headers["if-none-match"] === '"v1"') {
        return send(res, 304, { ETag: '"v1"' });
      }
      return send(
        res,
        200,
        { "Content-Type": "application/rss+xml", ETag: '"v1"' },
        RSS_XML,
      );
    };
    const source = await createSource("src-rss", `${baseUrl}/feed.xml`);

    await ProcessorsFetchSourceItems(span, source);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/feed.xml");
    expect(await countItems("src-rss")).toBe(2);
    const firstState = await getFetchState("src-rss");
    expect(firstState).toMatchObject({
      url: `${baseUrl}/feed.xml`,
      etag: '"v1"',
    });
    const firstInfo = (await reloadSource("src-rss")).info;
    expect(firstInfo.processorPath).toContain("800-RssProcessor");
    expect(firstInfo.fetchErrorCount).toBe(0);

    const sourceAgain = await reloadSource("src-rss");
    const fetchBefore = new Date(firstInfo.dateFetched).getTime();
    await new Promise((r) => setTimeout(r, 5));
    await ProcessorsFetchSourceItems(span, sourceAgain);

    expect(requests).toHaveLength(2);
    expect(requests[1].url).toBe("/feed.xml");
    expect(requests[1].headers["if-none-match"]).toBe('"v1"');
    expect(await countItems("src-rss")).toBe(2);
    const secondInfo = (await reloadSource("src-rss")).info;
    expect(secondInfo.fetchErrorCount).toBe(0);
    expect(new Date(secondInfo.dateFetched).getTime()).toBeGreaterThan(
      fetchBefore,
    );
    expect(secondInfo.lastFetchError).toBeUndefined();
  });

  test("200 responses update the stored validators", async () => {
    let etag = '"v1"';
    handler = (req, res) => {
      send(res, 200, { "Content-Type": "application/rss+xml", ETag: etag }, RSS_XML);
    };
    const source = await createSource("src-etag", `${baseUrl}/feed.xml`);
    await ProcessorsFetchSourceItems(span, source);
    expect((await getFetchState("src-etag")).etag).toBe('"v1"');

    etag = '"v2"';
    await ProcessorsFetchSourceItems(span, await reloadSource("src-etag"));
    expect((await getFetchState("src-etag")).etag).toBe('"v2"');
  });

  test("podcast source: one GET per cycle", async () => {
    handler = (_req, res) => {
      send(res, 200, { "Content-Type": "application/rss+xml" }, PODCAST_XML);
    };
    const source = await createSource("src-podcast", `${baseUrl}/podcast.xml`);

    await ProcessorsFetchSourceItems(span, source);

    expect(requests).toHaveLength(1);
    expect(await countItems("src-podcast")).toBe(1);
    expect((await reloadSource("src-podcast")).info.processorPath).toContain(
      "700-PodcastProcessor",
    );
  });

  test("a redirect is followed once per hop and the result is shared", async () => {
    handler = (req, res) => {
      if (req.url === "/feed") {
        return send(res, 302, { Location: `${baseUrl}/feed.xml` });
      }
      if (req.url === "/feed.xml") {
        return send(res, 200, { "Content-Type": "application/rss+xml" }, RSS_XML);
      }
      return send(res, 404, {});
    };
    const source = await createSource("src-redirect", `${baseUrl}/feed`);

    await ProcessorsFetchSourceItems(span, source);

    expect(requests.map((request) => request.url)).toEqual([
      "/feed",
      "/feed.xml",
    ]);
    expect(await countItems("src-redirect")).toBe(2);
  });

  test("re-fetching without validators keeps URL dedupe", async () => {
    handler = (_req, res) => {
      send(res, 200, { "Content-Type": "application/rss+xml" }, RSS_XML);
    };
    const source = await createSource("src-dedupe", `${baseUrl}/feed.xml`);

    await ProcessorsFetchSourceItems(span, source);
    await ProcessorsFetchSourceItems(span, await reloadSource("src-dedupe"));

    expect(requests).toHaveLength(2);
    expect(await countItems("src-dedupe")).toBe(2);
  });

  test("Atom feeds are parsed and deduplicated like RSS", async () => {
    handler = (_req, res) => {
      send(res, 200, { "Content-Type": "application/atom+xml" }, ATOM_XML);
    };
    const source = await createSource("src-atom", `${baseUrl}/atom.xml`);

    await ProcessorsFetchSourceItems(span, source);

    expect(requests).toHaveLength(1);
    expect(await countItems("src-atom")).toBe(1);
    expect((await reloadSource("src-atom")).info.processorPath).toContain(
      "800-RssProcessor",
    );
  });
});
