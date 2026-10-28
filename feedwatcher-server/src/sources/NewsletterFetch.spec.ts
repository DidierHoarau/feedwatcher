import { ConfigGet } from "../Config";
import { NEWSLETTER_PROVIDER } from "./NewsletterClient";
import {
  NewsletterAuthHeaders,
  NewsletterFetchOptionsForSource,
  NewsletterFetchOptionsForUrl,
} from "./NewsletterFetch";

jest.mock("../OTelContext", () => ({
  OTelLogger: () => ({
    createModuleLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

jest.mock("../Config", () => ({
  ConfigGet: jest.fn(),
}));

const INTERNAL =
  "http://feedwatcher-newsletter.feedwatcher.svc.cluster.local:8080";
const ADVERTISED = "https://newsletter.example/rss/morningbrew.token";

function config(overrides: Record<string, unknown> = {}) {
  jest.mocked(ConfigGet).mockReturnValue({
    NEWSLETTER_URL: INTERNAL,
    NEWSLETTER_AUTH_USERNAME: "feedwatcher",
    NEWSLETTER_AUTH_PASSWORD: "",
    ...overrides,
  } as any);
}

describe("NewsletterFetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config();
  });

  test("returns no trust or credentials for a non-provider source", () => {
    config({ NEWSLETTER_AUTH_PASSWORD: "secret" });
    expect(
      NewsletterFetchOptionsForSource({
        url: ADVERTISED,
        provider: "someone-else",
      }),
    ).toEqual({ trustedOrigins: [], headers: {}, rewriteBase: null });

    expect(NewsletterFetchOptionsForSource({ url: "https://example.com/f" })).toEqual({
      trustedOrigins: [],
      headers: {},
      rewriteBase: null,
    });
  });

  test("trusts the newsletter and advertised origins for a provider source", () => {
    config({ NEWSLETTER_AUTH_PASSWORD: "secret" });
    const options = NewsletterFetchOptionsForSource({
      url: ADVERTISED,
      provider: NEWSLETTER_PROVIDER,
      providerUrl: ADVERTISED,
    });

    expect(options.trustedOrigins.sort()).toEqual(
      [INTERNAL, "https://newsletter.example"].sort(),
    );
    expect(options.rewriteBase).toBe(INTERNAL);
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from("feedwatcher:secret").toString("base64")}`,
    );
  });

  test("sends no Authorization header when no password is configured", () => {
    const options = NewsletterFetchOptionsForSource({
      url: ADVERTISED,
      provider: NEWSLETTER_PROVIDER,
    });
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers).toEqual({});
  });

  test("returns an empty configuration when the integration is disabled", () => {
    config({ NEWSLETTER_URL: "" });
    expect(
      NewsletterFetchOptionsForSource({
        url: ADVERTISED,
        provider: NEWSLETTER_PROVIDER,
      }),
    ).toEqual({
      trustedOrigins: ["https://newsletter.example"],
      headers: {},
      rewriteBase: null,
    });
  });

  test("never sends credentials to a non-provider source", () => {
    config({ NEWSLETTER_AUTH_PASSWORD: "secret" });
    const options = NewsletterFetchOptionsForSource({ url: ADVERTISED });
    expect(options.headers).toEqual({});
    expect(options.trustedOrigins).toEqual([]);
  });

  test("builds options for a resolved URL without rewriting it", () => {
    config({ NEWSLETTER_AUTH_PASSWORD: "secret" });
    const options = NewsletterFetchOptionsForUrl(ADVERTISED, {
      providerUrl: ADVERTISED,
    });
    expect(options.trustedOrigins.sort()).toEqual(
      [INTERNAL, "https://newsletter.example"].sort(),
    );
    expect(options.rewriteBase).toBeNull();
    expect(options.headers.Authorization).toBeDefined();

    expect(NewsletterFetchOptionsForUrl(ADVERTISED, null)).toEqual({
      trustedOrigins: [],
      headers: {},
      rewriteBase: null,
    });
  });

  test("NewsletterAuthHeaders has no header when the password is empty", () => {
    expect(NewsletterAuthHeaders()).toEqual({});
    config({ NEWSLETTER_AUTH_PASSWORD: "secret" });
    expect(NewsletterAuthHeaders()).toEqual({
      Authorization: `Basic ${Buffer.from("feedwatcher:secret").toString("base64")}`,
    });
  });
});
