import axios from "axios";
import * as dns from "dns";
import * as http from "http";
import * as https from "https";

const ssrfHttp = require("../../processors-system/lib/ssrf-http.js");

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;

function okResponse(data = "ok", contentType = "text/plain") {
  return {
    status: 200,
    headers: { "content-type": contentType },
    data,
  } as any;
}

function agentLookup(agent: any, options: any): Promise<any> {
  return new Promise((resolve) => {
    agent.options.lookup("example.com", options, (...args: any[]) => {
      resolve(args);
    });
  });
}

describe("ssrf-http isPrivateAddress", () => {
  beforeEach(() => {
    ssrfHttp.configure({ allowPrivateNetwork: false });
  });

  test.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::127.0.0.1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe90::1",
    "febf::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "not-an-ip",
    "",
  ])("flags %s as private", (ip) => {
    expect(ssrfHttp.isPrivateAddress(ip)).toBe(true);
  });

  test.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "100.63.255.255",
    "100.128.0.0",
    "172.32.0.1",
    "192.0.1.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("accepts %s as public", (ip) => {
    expect(ssrfHttp.isPrivateAddress(ip)).toBe(false);
  });
});

describe("ssrf-http validateUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ssrfHttp.configure({ allowPrivateNetwork: false });
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test.each([
    "ftp://example.com/x",
    "file:///etc/passwd",
    "gopher://example.com/",
    "https://user:pass@example.com/feed",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://127.1/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/x",
  ])("rejects %s before any HTTP call", async (url) => {
    await expect(ssrfHttp.validateUrl(url)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects a private hostname without any HTTP call", async () => {
    jest
      .mocked(dns.promises.lookup)
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as any);
    await expect(
      ssrfHttp.validateUrl("https://internal.example/feed")
    ).rejects.toThrow("URL not allowed");
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects a host that resolves to both public and private addresses", async () => {
    jest.mocked(dns.promises.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ] as any);
    await expect(
      ssrfHttp.validateUrl("https://mixed.example/feed")
    ).rejects.toThrow("URL not allowed");
  });

  test("returns the validated public address to pin for a hostname", async () => {
    const result = await ssrfHttp.validateUrl("https://example.com/feed");
    expect(result.address).toBe("93.184.216.34");
    expect(result.family).toBe(4);
    expect(dns.promises.lookup).toHaveBeenCalledTimes(1);
  });
});

describe("ssrf-http fetchText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ssrfHttp.configure({ allowPrivateNetwork: false });
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test("pins the validated IP in the agent lookup (no second resolution)", async () => {
    jest.mocked(axios.get).mockResolvedValue(okResponse());

    await ssrfHttp.fetchText("https://example.com/feed", {
      allowedContentTypes: ["text/plain"],
    });

    expect(dns.promises.lookup).toHaveBeenCalledTimes(1);
    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.proxy).toBe(false);
    expect(options.maxRedirects).toBe(0);
    expect(options.httpsAgent).toBeInstanceOf(https.Agent);

    const scalar = await agentLookup(options.httpsAgent, {});
    expect(scalar).toEqual([null, "93.184.216.34", 4]);
    const all = await agentLookup(options.httpsAgent, { all: true });
    expect(all).toEqual([null, [{ address: "93.184.216.34", family: 4 }]]);
  });

  test("does not re-resolve DNS when a rebinding answer would be private", async () => {
    jest
      .mocked(dns.promises.lookup)
      .mockResolvedValueOnce(publicLookup)
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as any);
    jest.mocked(axios.get).mockResolvedValue(okResponse());

    await ssrfHttp.fetchText("https://example.com/feed", {
      allowedContentTypes: ["text/plain"],
    });

    expect(dns.promises.lookup).toHaveBeenCalledTimes(1);
    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    const scalar = await agentLookup(options.httpsAgent, {});
    expect(scalar).toEqual([null, "93.184.216.34", 4]);
  });

  test("rejects a redirect to a private address before requesting it", async () => {
    jest.mocked(axios.get).mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://127.0.0.1/secret" },
      data: "",
    } as any);

    await expect(
      ssrfHttp.fetchText("https://example.com/redirect")
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test("follows redirects up to the limit and rejects more", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 302,
      headers: { location: "https://example.com/next" },
      data: "",
    } as any);

    await expect(
      ssrfHttp.fetchText("https://example.com/redirect")
    ).rejects.toThrow("Too many redirects");
    expect(axios.get).toHaveBeenCalledTimes(4);
  });

  test("follows a relative redirect", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce({
        status: 301,
        headers: { location: "/feed.xml" },
        data: "",
      } as any)
      .mockResolvedValueOnce(okResponse("<rss/>"));

    const response = await ssrfHttp.fetchText("https://example.com/start");

    expect(response.data).toBe("<rss/>");
    expect(jest.mocked(axios.get).mock.calls[1][0]).toBe(
      "https://example.com/feed.xml"
    );
  });

  test("returns 502 for a non-2xx status", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 404,
      headers: {},
      data: "missing",
    } as any);

    await expect(
      ssrfHttp.fetchText("https://example.com/missing")
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  test("maps the size-cap error to 413", async () => {
    const sizeError: any = new Error("maxContentLength size exceeded");
    sizeError.code = "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED";
    jest.mocked(axios.get).mockRejectedValue(sizeError);

    await expect(
      ssrfHttp.fetchText("https://example.com/huge")
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  test("rejects a disallowed content type with 415", async () => {
    jest.mocked(axios.get).mockResolvedValue(okResponse("{}", "text/html"));

    await expect(
      ssrfHttp.fetchText("https://example.com/api", {
        allowedContentTypes: ["application/json"],
      })
    ).rejects.toMatchObject({ statusCode: 415 });
  });

  test("does not restrict the content type when the allow-list is null", async () => {
    jest.mocked(axios.get).mockResolvedValue(okResponse("feed", "text/xml"));

    await expect(
      ssrfHttp.fetchText("https://example.com/feed", {
        allowedContentTypes: null,
      })
    ).resolves.toMatchObject({ data: "feed" });
  });

  test("caps content length and timeout by default", async () => {
    jest.mocked(axios.get).mockResolvedValue(okResponse());

    await ssrfHttp.fetchText("https://example.com/feed", {
      allowedContentTypes: ["text/plain"],
    });

    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.maxContentLength).toBe(2 * 1024 * 1024);
    expect(options.timeout).toBe(10000);
  });

  test("uses an http agent for http URLs", async () => {
    jest.mocked(axios.get).mockResolvedValue(okResponse());

    await ssrfHttp.fetchText("http://example.com/feed", {
      allowedContentTypes: ["text/plain"],
    });

    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.httpAgent).toBeInstanceOf(http.Agent);
    expect(options.httpsAgent).toBeUndefined();
  });
});

describe("ssrf-http private-network opt-in", () => {
  afterAll(() => {
    ssrfHttp.configure({ allowPrivateNetwork: false });
  });

  test("permits private targets only when configured", async () => {
    jest.clearAllMocks();
    await expect(
      ssrfHttp.validateUrl("http://127.0.0.1/feed")
    ).rejects.toMatchObject({ statusCode: 400 });

    ssrfHttp.configure({ allowPrivateNetwork: true });
    await expect(
      ssrfHttp.validateUrl("http://127.0.0.1/feed")
    ).resolves.toMatchObject({ address: "127.0.0.1" });

    jest.mocked(axios.get).mockResolvedValue(okResponse());
    await expect(
      ssrfHttp.fetchText("http://127.0.0.1/feed", {
        allowedContentTypes: ["text/plain"],
      })
    ).resolves.toMatchObject({ data: "ok" });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
