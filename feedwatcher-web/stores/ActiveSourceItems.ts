import { Timeout } from "~~/services/Timeout";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import axios from "axios";

export const ActiveSourceItems = defineStore("ActiveSourceItems", {
  state: () => ({
    sourceItems: [],
    selectedSource: "",
    page: 1,
    filterStatus: "unread",
    searchCriteria: "all",
    pageHasMore: false,
    searchCriteriaValue: "",
  }),

  getters: {},

  actions: {
    async fetchItems(): Promise<void> {
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
      this.sourceItems = [];
      await Timeout.wait(10);
      await axios
        .post(`${(await Config.get()).SERVER_URL}/items/search`, searchOptions, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceItems = res.data.sourceItems;
          this.pageHasMore = res.data.pageHasMore;
        })
        .catch(handleError);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(ActiveSourceItems, import.meta.hot));
}
