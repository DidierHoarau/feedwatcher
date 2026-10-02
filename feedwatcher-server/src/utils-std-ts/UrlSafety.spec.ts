import axios from "axios";
import * as dns from "dns";
import {
  isPrivateAddress,
  UrlSafetyError,
  UrlSafetyFetchText,
  UrlSafetyValidate,
} from "./UrlSafety";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const publicLookup = [
  { address: "93.184.216.34", family: 4 },
] as any;

describe("isPrivateAddress", () => {
  test.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.1.1",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "not-an-ip",
    "",
  ])("flags %s as private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  test.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("accepts %s as public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("UrlSafetyValidate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test("rejects non-http protocols", async () => {
    await expect(UrlSafetyValidate("ftp://example.com/x")).rejects.toThrow(
      UrlSafetyError
    );
    await expect(UrlSafetyValidate("file:///etc/passwd")).rejects.toThrow(
      UrlSafetyError
    );
  });

  test("rejects loopback and private IP literals without any lookup", async () => {
    await expect(UrlSafetyValidate("http://127.0.0.1/secret")).rejects.toThrow(
      "URL not allowed"
    );
    await expect(UrlSafetyValidate("http://192.168.0.1/x")).rejects.toThrow(
      "URL not allowed"
    );
    await expect(UrlSafetyValidate("http://[::1]/x")).rejects.toThrow(
      "URL not allowed"
    );
    expect(dns.promises.lookup).not.toHaveBeenCalled();
  });

  test("rejects a hostname resolving to a private address", async () => {
    jest
      .mocked(dns.promises.lookup)
      .mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as any);
    await expect(UrlSafetyValidate("http://internal.example/x")).rejects.toThrow(
      "URL not allowed"
    );
  });

  test("rejects a hostname resolving to one public and one private address", async () => {
    jest.mocked(dns.promises.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ] as any);
    await expect(UrlSafetyValidate("http://mixed.example/x")).rejects.toThrow(
      "URL not allowed"
    );
  });

  test("accepts a hostname resolving to public addresses", async () => {
    await expect(
      UrlSafetyValidate("https://example.com/feed")
    ).resolves.toBeUndefined();
  });

  test("rejects credentials in the url", async () => {
    await expect(
      UrlSafetyValidate("https://user:pass@example.com/feed")
    ).rejects.toThrow("Invalid URL");
  });
});

describe("UrlSafetyFetchText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test("fetches an allowed content type", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      data: "<html>ok</html>",
    } as any);

    await expect(UrlSafetyFetchText("https://example.com/page")).resolves.toBe(
      "<html>ok</html>"
    );
  });

  test("rejects loopback targets before any HTTP call", async () => {
    await expect(UrlSafetyFetchText("http://127.0.0.1/secret")).rejects.toMatchObject(
      { statusCode: 400 }
    );
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects a redirect that points to a private target", async () => {
    jest.mocked(axios.get).mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://127.0.0.1/secret" },
      data: "",
    } as any);

    await expect(
      UrlSafetyFetchText("https://example.com/redirect")
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("follows a bounded number of redirects and rejects beyond that", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 302,
      headers: { location: "https://example.com/next" },
      data: "",
    } as any);

    await expect(
      UrlSafetyFetchText("https://example.com/redirect")
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(jest.mocked(axios.get).mock.calls.length).toBeLessThanOrEqual(5);
  });

  test("rejects a disallowed content type", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      data: "binary",
    } as any);

    await expect(
      UrlSafetyFetchText("https://example.com/file.bin")
    ).rejects.toMatchObject({ statusCode: 415 });
  });

  test("maps the size-cap error to a 413", async () => {
    const sizeError: any = new Error("maxContentLength size exceeded");
    sizeError.code = "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED";
    jest.mocked(axios.get).mockRejectedValue(sizeError);

    await expect(
      UrlSafetyFetchText("https://example.com/huge")
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  test("caps the response size option sent to axios", async () => {
    jest.mocked(axios.get).mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/plain" },
      data: "ok",
    } as any);

    await UrlSafetyFetchText("https://example.com/page");

    const options = jest.mocked(axios.get).mock.calls[0][1] as any;
    expect(options.maxContentLength).toBe(2 * 1024 * 1024);
    expect(options.maxRedirects).toBe(0);
  });
});
