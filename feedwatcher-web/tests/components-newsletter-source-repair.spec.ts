import { flushPromises, mount } from "@vue/test-utils";
import { h } from "vue";
import axios from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import NewsletterSourceRepair from "~~/components/NewsletterSourceRepair.vue";
import { EventBus, EventTypes } from "~~/services/EventBus";

vi.mock("axios");

(globalThis as any).EventBus = EventBus;
(globalThis as any).EventTypes = EventTypes;

const NuxtLinkStub = {
  props: ["to"],
  render() {
    return h(
      "a",
      { href: this.to },
      this.$slots && this.$slots.default ? this.$slots.default() : [],
    );
  },
};

function mountRepair() {
  return mount(NewsletterSourceRepair, {
    global: {
      stubs: { Loading: true, NuxtLink: NuxtLinkStub },
    },
  });
}

const DRY_RUN_REPORT = {
  dryRun: true,
  catalogueAvailable: true,
  backfilled: 1,
  repaired: [
    { sourceId: "source-1", sourceName: "Alpha News", feedId: "alpha" },
    { sourceId: "source-2", sourceName: "Beta Weekly", feedId: "beta" },
  ],
  orphaned: [
    { sourceId: "source-3", sourceName: "Gamma Digest", feedId: "gamma" },
  ],
  unchanged: 4,
  unverified: 0,
};

function mockStatus(enabled: boolean) {
  vi.mocked(axios.get).mockResolvedValue({
    data: { newsletterEnabled: enabled },
  } as any);
}

describe("NewsletterSourceRepair", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.post).mockResolvedValue({ data: DRY_RUN_REPORT } as any);
  });

  test("renders nothing when the newsletter integration is disabled", async () => {
    mockStatus(false);
    const wrapper = mountRepair();
    await flushPromises();

    expect(wrapper.find(".newsletter-repair").exists()).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("checks sources with a dry run and lists repairable and orphaned sources", async () => {
    mockStatus(true);
    const wrapper = mountRepair();
    await flushPromises();

    const check = wrapper
      .findAll("button")
      .find((button) => button.text() === "Check sources");
    await check.trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    const [url, payload] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toContain("/sources/newsletter/repair");
    expect(payload).toEqual({ dryRun: true });
    expect(wrapper.text()).toContain("2 repairable");
    expect(wrapper.text()).toContain("1 orphaned");
    expect(wrapper.text()).toContain("4 unchanged");
    expect(wrapper.text()).toContain("Can be repaired");
    expect(wrapper.text()).toContain("Orphaned feeds");
    const links = wrapper.findAll("a").map((link) => link.attributes("href"));
    expect(links).toEqual(
      expect.arrayContaining(["/sources/source-1", "/sources/source-3"]),
    );
  });

  test("repairs in place and announces the result", async () => {
    mockStatus(true);
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: DRY_RUN_REPORT } as any)
      .mockResolvedValueOnce({
        data: { ...DRY_RUN_REPORT, dryRun: false, orphaned: [] },
      } as any);
    const emitSpy = vi.spyOn(EventBus, "emit");
    const wrapper = mountRepair();
    await flushPromises();

    const buttons = () => wrapper.findAll("button");
    await buttons()
      .find((button) => button.text() === "Check sources")
      .trigger("click");
    await flushPromises();

    const repair = buttons().find((button) => button.text() === "Repair now");
    expect(repair.attributes("disabled")).toBeUndefined();
    await repair.trigger("click");
    await flushPromises();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(axios.post).mock.calls[1][1]).toEqual({ dryRun: false });
    expect(wrapper.text()).toContain("Repaired 2");
    expect(emitSpy).toHaveBeenCalledWith(
      EventTypes.ALERT_MESSAGE,
      expect.objectContaining({ type: "info" }),
    );
    emitSpy.mockRestore();
  });

  test("keeps the repair button disabled when nothing can be repaired", async () => {
    mockStatus(true);
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        dryRun: true,
        catalogueAvailable: true,
        backfilled: 0,
        repaired: [],
        orphaned: [],
        unchanged: 3,
        unverified: 0,
      },
    } as any);
    const wrapper = mountRepair();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Check sources")
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Everything is up to date.");
    const repair = wrapper
      .findAll("button")
      .find((button) => button.text() === "Repair now");
    expect(repair.attributes("disabled")).toBeDefined();
  });

  test("surfaces a repair failure on the event bus", async () => {
    mockStatus(true);
    vi.mocked(axios.post).mockRejectedValue({
      response: {
        status: 502,
        data: { error: "The newsletter service is unreachable." },
      },
    });
    const emitSpy = vi.spyOn(EventBus, "emit");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mountRepair();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Check sources")
      .trigger("click");
    await flushPromises();

    expect(emitSpy).toHaveBeenCalledWith(EventTypes.ALERT_MESSAGE, {
      type: "error",
      text: "The newsletter service is unreachable.",
    });
    expect(wrapper.find(".repair-report").exists()).toBe(false);
    emitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
