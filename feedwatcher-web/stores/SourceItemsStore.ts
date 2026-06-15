import { Timeout } from "~~/services/Timeout";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
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
    nextCursor: "",
    etagFetch: "",
  }),

  getters: {},

  actions: {
    async fetch(): Promise<void> {
      this.sourceItems = [];
      this.nextCursor = "";
      this.pageHasMore = false;
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
      };
      if (this.nextCursor) {
        searchOptions.beforeDate = this.nextCursor;
      }
      if (this.searchCriteria === "sourceId") {
        searchOptions.sourceId = this.searchCriteriaValue;
      } else if (this.searchCriteria === "labelName") {
        searchOptions.labelName = this.searchCriteriaValue;
      }
      searchOptions.isSaved = this.filterSaved;
      searchOptions.pattern = this.searchPattern;
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
            this.nextCursor = res.data.nextCursor || "";
          }
        })
        .catch(handleError);
      if (etagFetch === this.etagFetch) {
        this.loading = false;
        this.loadingMore = false;
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(SourceItemsStore, import.meta.hot));
}
