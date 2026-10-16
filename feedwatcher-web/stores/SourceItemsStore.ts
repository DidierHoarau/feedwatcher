import { Timeout } from "~~/services/Timeout";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError } from "~~/services/EventBus";
import axios from "axios";

export const SourceItemsStore = defineStore("SourceItemsStore", {
  state: () => ({
    sourceItems: [],
    selectedSource: "",
    filterStatus: "unread",
    searchCriteria: "all",
    filterSaved: false,
    pageHasMore: false,
    loading: false,
    loadingMore: false,
    searchCriteriaValue: "",
    searchPattern: "",
    sort: "date_desc",
    minDate: "",
    maxDate: "",
    searchTagName: "",
    availableTags: [],
    nextCursor: null,
    etagFetch: "",
  }),

  getters: {},

  actions: {
    async fetch(): Promise<void> {
      this.sourceItems = [];
      this.nextCursor = null;
      this.pageHasMore = false;
      this.loadingMore = false;
      await this.fetchMore();
    },
    async fetchMore(): Promise<void> {
      if (this.loadingMore) {
        return;
      }
      const etagFetch = new Date().toISOString();
      this.etagFetch = etagFetch;
      const searchOptions: any = {
        filterStatus: this.filterStatus,
        searchCriteria: this.searchCriteria,
        sort: this.sort,
      };
      if (this.nextCursor) {
        searchOptions.cursor = this.nextCursor;
      }
      if (this.searchCriteria === "sourceId") {
        searchOptions.sourceId = this.searchCriteriaValue;
      } else if (this.searchCriteria === "labelName") {
        searchOptions.labelName = this.searchCriteriaValue;
      }
      searchOptions.isSaved = this.filterSaved;
      searchOptions.pattern = this.searchPattern;
      if (this.minDate) {
        searchOptions.sinceDate = new Date(`${this.minDate}T00:00:00.000Z`).toISOString();
      }
      if (this.maxDate) {
        searchOptions.untilDate = new Date(`${this.maxDate}T23:59:59.999Z`).toISOString();
      }
      if (this.searchTagName) {
        searchOptions.tagName = this.searchTagName;
      }
      this.pageHasMore = false;
      this.loadingMore = true;
      this.loading = true;
      await Timeout.wait(10);
      await axios
        .post(
          `${(await Config.get()).SERVER_URL}/items/search`,
          searchOptions,
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          if (etagFetch === this.etagFetch) {
            const existingIds = new Set(this.sourceItems.map((i) => i.id));
            const newItems = (res.data.sourceItems || []).filter(
              (item) => !existingIds.has(item.id),
            );
            this.sourceItems = [...this.sourceItems, ...newItems];
            this.pageHasMore = res.data.pageHasMore;
            this.nextCursor = res.data.nextCursor || null;
          }
        })
        .catch(handleError);
      if (etagFetch === this.etagFetch) {
        this.loading = false;
        this.loadingMore = false;
      }
    },
    // Searching switches to ranked ("best match") ordering; clearing the
    // pattern falls back to newest-first.
    async setSearchPattern(pattern: string): Promise<void> {
      this.searchPattern = pattern;
      this.sort = pattern ? "relevance" : "date_desc";
      await this.fetch();
    },
    async fetchAvailableTags(): Promise<void> {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/items/tags`, await AuthService.getAuthHeader())
        .then((res) => {
          this.availableTags = res.data.tags || [];
        })
        .catch(handleError);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(SourceItemsStore, import.meta.hot));
}
