import { flushPromises, mount } from "@vue/test-utils";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ImportExportPage from "~~/pages/settings/import-export.vue";

vi.mock("axios");

vi.mock("~~/services/AuthService", () => ({
  AuthService: {
    getAuthHeader: vi.fn(async () => ({})),
  },
}));

vi.mock("~~/services/Config.ts", () => ({
  default: {
    get: vi.fn(async () => ({ SERVER_URL: "https://feedwatcher.example/api" })),
  },
}));

describe("Settings Import / Export page", () => {
  let clickedDownloads: string[];

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: "export" } as any);
    clickedDownloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownloads.push(this.download);
    });
    vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:mock");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function clickButton(
    wrapper: ReturnType<typeof mount>,
    text: string,
  ): Promise<void> {
    const button = wrapper
      .findAll("button")
      .find((candidate) => candidate.text().includes(text));
    expect(button).toBeTruthy();
    await button!.trigger("click");
    await flushPromises();
  }

  test("downloads sources as JSON", async () => {
    const wrapper = mount(ImportExportPage);
    await clickButton(wrapper, "Export JSON (sources)");

    expect(axios.get).toHaveBeenCalledWith(
      "https://feedwatcher.example/api/sources/import/export/json",
      expect.anything(),
    );
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]).toMatch(/^sources_export_.*\.json$/);
    wrapper.unmount();
  });

  test("downloads sources and items as JSON", async () => {
    const wrapper = mount(ImportExportPage);
    await clickButton(wrapper, "Export JSON (sources + items)");

    expect(axios.get).toHaveBeenCalledWith(
      "https://feedwatcher.example/api/sources/import/export/json?includeItems=true",
      expect.anything(),
    );
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]).toMatch(/\.json$/);
    wrapper.unmount();
  });

  test("keeps the OPML export unchanged", async () => {
    const wrapper = mount(ImportExportPage);
    await clickButton(wrapper, "Export OPML");

    expect(axios.get).toHaveBeenCalledWith(
      "https://feedwatcher.example/api/sources/import/export/opml",
      expect.anything(),
    );
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]).toMatch(/\.opml$/);
    wrapper.unmount();
  });
});
