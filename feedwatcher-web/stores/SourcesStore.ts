import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError } from "~~/services/EventBus";
import axios from "axios";
import { find, findIndex, sortBy } from "lodash";
import { PreferencesLabels } from "~~/services/PreferencesLabels";
import {
  applyTreeVisibility,
  assignTreeCounts,
  buildSourceTree,
} from "~~/services/SourceTree";

const PREFERENCES_SOURCES_LIST_DISPLAY = "preferences_sources_list_display";

function readListMenuOpened(): boolean {
  try {
    const preferences =
      JSON.parse(
        localStorage.getItem(PREFERENCES_SOURCES_LIST_DISPLAY) as string,
      ) || {};
    return preferences.isCollapsed !== true;
  } catch {
    return true;
  }
}

function persistListMenuOpened(open: boolean) {
  localStorage.setItem(
    PREFERENCES_SOURCES_LIST_DISPLAY,
    JSON.stringify({ isCollapsed: !open }),
  );
}

export const SourcesStore = defineStore("SourcesStore", {
  state: () => ({
    sourcesStr: "",
    sources: [],
    selectedIndex: -1,
    sourceCounts: [],
    savedCounts: [],
    countsFetchedAt: 0,
    countsFetchPromise: null as Promise<unknown> | null,
    selectedSourceId: "",
    selectedLabel: "",
    selectedRoot: true,
    listMenuOpened: readListMenuOpened(),
  }),

  getters: {
    totalUnreadCount(): number {
      return this.sourceCounts.reduce(
        (total: number, count: any) => total + (count.unreadCount || 0),
        0,
      );
    },
    totalSavedCount(): number {
      return this.savedCounts.reduce(
        (total: number, count: any) => total + (count.savedCount || 0),
        0,
      );
    },
    scopeText(): string {
      if (this.selectedRoot) {
        return "All";
      }
      if (this.selectedSourceId !== "") {
        const source = find(this.sources, {
          sourceId: this.selectedSourceId,
        }) as any;
        return source ? source.displayName : "";
      }
      if (this.selectedLabel !== "") {
        const label = find(this.sources, {
          labelName: this.selectedLabel,
          isLabel: true,
        }) as any;
        return label ? label.displayName : "";
      }
      return "";
    },
  },

  actions: {
    toggleListMenu() {
      this.listMenuOpened = !this.listMenuOpened;
      persistListMenuOpened(this.listMenuOpened);
    },
    setSelectedSourceId(sourceId: string) {
      this.selectedSourceId = sourceId;
      this.selectedLabel = "";
      this.selectedRoot = false;
      this.updateSelectedIndex();
    },
    setSelectedLabel(labelName: string) {
      this.selectedSourceId = "";
      this.selectedLabel = labelName;
      this.selectedRoot = false;
      this.updateSelectedIndex();
    },
    setSelectedRoot() {
      this.selectedSourceId = "";
      this.selectedLabel = "";
      this.selectedRoot = true;
      this.updateSelectedIndex();
    },
    updateSelectedIndex() {
      if (this.selectedRoot === true) {
        this.selectedIndex = 0;
        return;
      }
      if (this.selectedSourceId !== "") {
        const position = findIndex(this.sources, {
          sourceId: this.selectedSourceId,
        });
        if (position < 0) {
          return;
        }
        this.selectedIndex = position;
        return;
      }
      if (this.selectedLabel !== "") {
        const position = findIndex(this.sources, {
          labelName: this.selectedLabel,
          isLabel: true,
        });
        if (position < 0) {
          return;
        }
        this.selectedIndex = position;
        return;
      }
    },
    async fetch() {
      await axios
        .get(
          `${(await Config.get()).SERVER_URL}/sources/labels`,
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          const sourcesData = sortBy(res.data.sourceLabels, [
            "labelName",
            "sourceName",
          ]);
          const soucesStr = JSON.stringify(sourcesData);
          if (this.sourcesStr === soucesStr) {
            this.checkVisibility();
            assignTreeCounts(
              this.sources as any[],
              this.sourceCounts,
              "unreadCount",
            );
            assignTreeCounts(
              this.sources as any[],
              this.savedCounts,
              "savedCount",
            );
            return this.fetchCounts();
          }
          this.sourcesStr = soucesStr;
          this.sources = buildSourceTree(
            sourcesData as any[],
            (labelName) => PreferencesLabels.isCollapsed(labelName),
          ) as never[];
          assignTreeCounts(
            this.sources as any[],
            this.sourceCounts,
            "unreadCount",
          );
          assignTreeCounts(
            this.sources as any[],
            this.savedCounts,
            "savedCount",
          );
          this.updateSelectedIndex();
          return this.fetchCounts();
        })
        .catch(handleError);
    },
    async fetchCounts() {
      if (this.countsFetchPromise) {
        return this.countsFetchPromise;
      }
      this.countsFetchPromise = Promise.all([
        axios
          .get(
            `${(await Config.get()).SERVER_URL}/sources/labels/counts/unread`,
            await AuthService.getAuthHeader(),
          )
          .then((res) => {
            this.sourceCounts = res.data.counts;
            assignTreeCounts(
              this.sources as any[],
              this.sourceCounts,
              "unreadCount",
            );
          })
          .catch(handleError),
        axios
          .get(
            `${(await Config.get()).SERVER_URL}/sources/labels/counts/saved`,
            await AuthService.getAuthHeader(),
          )
          .then((res) => {
            this.savedCounts = res.data.counts;
            assignTreeCounts(
              this.sources as any[],
              this.savedCounts,
              "savedCount",
            );
          })
          .catch(handleError),
      ]).finally(() => {
        // Errors count as attempts too, so failing requests retry at the caller's cadence
        this.countsFetchedAt = Date.now();
        this.countsFetchPromise = null;
      });
      return this.countsFetchPromise;
    },
    async fetchCountsIfStale(maxAgeMs: number) {
      if (Date.now() - this.countsFetchedAt < maxAgeMs) {
        return;
      }
      return this.fetchCounts();
    },

    toggleLabelCollapsed(index: number) {
      const source = this.sources[index] as any;
      if (source.isLabel && !source.isRoot) {
        source.isCollapsed = !source.isCollapsed;
        PreferencesLabels.toggleCollapsed(source.labelName);
        this.checkVisibility();
      }
    },
    checkVisibility() {
      applyTreeVisibility(this.sources as any[]);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(SourcesStore, import.meta.hot));
}
