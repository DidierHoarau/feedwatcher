import { Timeout } from "~~/services/Timeout";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import axios from "axios";
import { concat } from "lodash";

export const SourceItemsStore = defineStore("SourceItemsStore", {
  state: () => ({
    sourceItems: [],
    selectedSource: "",
    page: 1,
    filterStatus: "unread",
    searchCriteria: "all",
    filterSaved: false,
    pageHasMore: false,
    loading: false,
    searchCriteriaValue: "",
    etagFetch: "",
  }),

  getters: {},

  actions: {
    async fetch(): Promise<void> {
      this.sourceItems = [];
      this.page = 1;
      this.fetchMore();
    },
    async fetchMore(): Promise<void> {
      const etagFetch = new Date().toISOString();
      this.etagFetch = etagFetch;
      const searchOptions: any = {
        page: this.page,
        filterStatus: this.filterStatus,
        searchCriteria: this.searchCriteria,
      };
      if (this.searchCriteria === "sourceId") {
        searchOptions.sourceId = this.searchCriteriaValue;
      } else if (this.searchCriteria === "labelName") {
        searchOptions.labelName = this.searchCriteriaValue;
      }
      searchOptions.isSaved = this.filterSaved;
      this.pageHasMore = false;
      this.loading = true;
      await Timeout.wait(10);
      await axios
        .post(`${(await Config.get()).SERVER_URL}/items/search`, searchOptions, await AuthService.getAuthHeader())
        .then((res) => {
          if (etagFetch === this.etagFetch) {
            this.sourceItems = concat(this.sourceItems, res.data.sourceItems);
            this.pageHasMore = res.data.pageHasMore;
          }
        })
        .catch(handleError);
      if (etagFetch === this.etagFetch) {
        this.loading = false;
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(SourceItemsStore, import.meta.hot));
}
