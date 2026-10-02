import Fastify, { FastifyInstance } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import { XMLParser } from "fast-xml-parser";
import { SourcesImportRoutes } from "./SourcesImportRoutes";
import { SourceLabelsDataListForUser } from "./SourceLabelsData";
import { AuthGetUserSession } from "../users/Auth";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("./SourceLabelsData", () => ({
  SourceLabelsDataListForUser: jest.fn(),
}));

const OPML_INPUT = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Feed A" type="rss" xmlUrl="https://a.example/feed.xml"/>
    </outline>
    <outline text="Feed B" type="rss" xmlUrl="https://b.example/feed.xml"/>
  </body>
</opml>`;

async function buildFastify(): Promise<FastifyInstance> {
  const fastify = Fastify();
  await fastify.register(fastifyMultipart);
  await new SourcesImportRoutes().getRoutes(fastify);
  await fastify.ready();
  return fastify;
}

describe("SourcesImportRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
  });

  test("analyzes an OPML document with nested folders (M12)", async () => {
    const fastify = await buildFastify();
    const boundary = "----test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="feeds.opml"\r\nContent-Type: text/xml\r\n\r\n`
      ),
      Buffer.from(OPML_INPUT),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await fastify.inject({
      method: "POST",
      url: "/analyze/opml",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0].name).toBe("Feed A");
    expect(body.sources[0].info.url).toBe("https://a.example/feed.xml");
    expect(body.sources[0].labels).toEqual(["Tech"]);
    expect(body.sources[1].name).toBe("Feed B");
    await fastify.close();
  });

  test("rejects an invalid OPML document with 400 (M12)", async () => {
    const fastify = await buildFastify();
    const boundary = "----test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="x.opml"\r\nContent-Type: text/xml\r\n\r\n`
      ),
      Buffer.from("this is not xml at all <<<"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await fastify.inject({
      method: "POST",
      url: "/analyze/opml",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(400);
    await fastify.close();
  });

  test("exports a re-importable OPML with correct headers (M12, L5)", async () => {
    jest.mocked(SourceLabelsDataListForUser).mockResolvedValue([
      {
        sourceName: "Feed A",
        sourceInfo: { icon: "rss", url: "https://a.example/feed.xml" },
        labelName: "Tech",
      },
      {
        sourceName: "Feed B",
        sourceInfo: { icon: "podcast", url: "https://b.example/feed.xml" },
        labelName: "",
      },
    ] as any);
    const fastify = await buildFastify();

    const response = await fastify.inject({
      method: "GET",
      url: "/export/opml",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/x-opml");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="feedwatcher.opml"'
    );

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
      isArray: (name) => name === "outline",
    });
    const parsed = parser.parse(response.body);
    const outlines = parsed.opml.body.outline;
    expect(outlines).toHaveLength(2);
    const folder = outlines.find((outline: any) => outline.title === "Tech");
    expect(folder).toBeTruthy();
    expect(folder.outline[0].text).toBe("Feed A");
    expect(folder.outline[0].xmlUrl).toBe("https://a.example/feed.xml");
    const direct = outlines.find((outline: any) => outline.text === "Feed B");
    expect(direct).toBeTruthy();
    expect(direct.url).toBe("https://b.example/feed.xml");
    await fastify.close();
  });

  test("returns 403 when unauthenticated", async () => {
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: false,
    });
    const fastify = await buildFastify();
    const response = await fastify.inject({
      method: "GET",
      url: "/export/opml",
    });
    expect(response.statusCode).toBe(403);
    await fastify.close();
  });
});
