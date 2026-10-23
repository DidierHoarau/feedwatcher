import axios from "axios";
import * as dns from "dns";
import { Source } from "../../model/Source";
import processor from "../../../processors-system/603-MastodonProcessor";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const publicLookup = [{ address: "93.184.216.34", family: 4 }] as any;

function jsonResponse(data: any) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    data: JSON.stringify(data),
  } as any;
}

describe("Mastodon processor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dns.promises.lookup).mockResolvedValue(publicLookup);
  });

  test("resolves a valid handle through the instance API", async () => {
    jest
      .mocked(axios.get)
      .mockResolvedValueOnce(
        jsonResponse({ accounts: [{ id: "123", username: "user" }] })
      )
      .mockResolvedValueOnce(jsonResponse({ display_name: "User Name" }));
    const source = new Source();
    source.info = { url: "@user@mastodon.social" };

    await expect(processor.test(source)).resolves.toEqual({
      name: "User Name @user@mastodon.social",
      icon: "mastodon",
      accountId: "123",
    });
    expect(jest.mocked(axios.get).mock.calls[0][0]).toBe(
      "https://mastodon.social/api/v2/search?q=user"
    );
    expect(jest.mocked(axios.get).mock.calls[1][0]).toBe(
      "https://mastodon.social/api/v1/accounts/123"
    );
  });

  test("rejects a known accountId without any network call", async () => {
    const source = new Source();
    source.info = {
      url: "@user@mastodon.social",
      accountId: "123",
    };

    await expect(processor.test(source)).resolves.toEqual(source.info);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test.each([
    "@user@127.0.0.1",
    "@user@localhost",
    "@user@mastodon.social:8080",
    "@user@mastodon.social/path",
    "@user@-broken.example",
    "user@mastodon.social",
    "https://mastodon.social/@user",
    "@user@",
    "",
  ])("returns null without fetching for invalid handle %s", async (handle) => {
    const source = new Source();
    source.info = { url: handle };

    await expect(processor.test(source)).resolves.toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("rejects fetchLatest for an invalid handle", async () => {
    const source = new Source();
    source.info = { url: "@user@127.0.0.1", accountId: "123" };

    await expect(processor.fetchLatest(source, null)).rejects.toThrow(
      "Invalid Mastodon handle"
    );
    expect(axios.get).not.toHaveBeenCalled();
  });

  test.each(["abc", "", "../123", "12 3"])(
    "rejects fetchLatest for an invalid account id (%s)",
    async (accountId) => {
      const source = new Source();
      source.info = { url: "@user@mastodon.social", accountId };

      await expect(processor.fetchLatest(source, null)).rejects.toThrow(
        "Invalid Mastodon account ID"
      );
      expect(axios.get).not.toHaveBeenCalled();
    }
  );

  test("fetches statuses for a valid handle and account id", async () => {
    jest.mocked(axios.get).mockResolvedValueOnce(
      jsonResponse([
        {
          url: "https://mastodon.social/@user/1",
          content: "<p>Hello</p>",
          created_at: "2025-10-01T12:00:00.000Z",
        },
      ])
    );
    const source = new Source();
    source.info = { url: "@user@mastodon.social", accountId: "123" };

    const sourceItems = await processor.fetchLatest(source, null);

    expect(jest.mocked(axios.get).mock.calls[0][0]).toBe(
      "https://mastodon.social/api/v1/accounts/123/statuses"
    );
    expect(sourceItems).toHaveLength(1);
    expect(sourceItems[0].title).toBe("Hello");
  });
});
