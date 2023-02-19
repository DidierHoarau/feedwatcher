import { Timeout } from "~~/services/Timeout";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import axios from "axios";
import * as _ from "lodash";

export const SourcesStore = defineStore("SourcesStore", {
  state: () => ({
    sources: [],
    selectedIndex: -1,
    sourceCounts: [],
  }),

  getters: {},

  actions: {
    async fetch() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels`, await AuthService.getAuthHeader())
        .then((res) => {
          const sourceSorted = _.sortBy(res.data.sourceLabels, ["labelName", "sourceName"]);
          const sourcesTmp: any[] = [];
          sourcesTmp.push({
            isLabel: true,
            isRoot: true,
            depth: 0,
            name: "All",
            displayName: "All",
            labelName: "",
            unreadCount: 0,
          });
          for (let i = 0; i < sourceSorted.length; i++) {
            const sourceData = sourceSorted[i];
            const source: any = {};
            let labelSplit = [];
            if (sourceData.labelName) {
              labelSplit = sourceData.labelName.split("/");
            }
            if (labelSplit.length > 0 && sourceData.labelName !== sourcesTmp[sourcesTmp.length - 1].labelName) {
              sourcesTmp.push({
                isLabel: true,
                depth: labelSplit.length,
                labelName: sourceData.labelName,
                displayName: labelSplit[labelSplit.length - 1],
                unreadCount: 0,
              });
            }
            sourcesTmp.push({
              sourceId: sourceData.sourceId,
              isLabel: false,
              isRoot: false,
              depth: labelSplit.length + 1,
              name: sourceData.sourceName,
              labelName: sourceData.labelName || "",
              displayName: sourceData.sourceName,
              unreadCount: 0,
            });
          }
          this.sources = sourcesTmp as never[];
          return this.fetchCounts();
        })
        .catch(handleError);
    },
    async fetchCounts() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels/counts/unread`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceCounts = res.data.counts;
          this.assignCounts(0);
        })
        .catch(handleError);
    },
    assignCounts(index: number) {
      if (index >= this.sources.length) {
        return;
      }
      const source: any = this.sources[index];
      if (!source.isLabel) {
        const foundCount = _.find(this.sourceCounts, { sourceId: source.sourceId });
        if (foundCount) {
          source.unreadCount = foundCount.unreadCount;
        } else {
          source.unreadCount = 0;
        }
        this.assignCounts(index + 1);
        return;
      }
      let nextIteration = index + 1;
      let count = 0;
      while (nextIteration < this.sources.length) {
        const sourceNext = this.sources[nextIteration] as any;
        if (!sourceNext.isLabel && sourceNext.labelName.indexOf(source.labelName) === 0) {
          const sourceCounNext = _.find(this.sourceCounts, { sourceId: sourceNext.sourceId });
          if (sourceCounNext) {
            count += sourceCounNext.unreadCount;
          }
        }
        nextIteration++;
      }
      source.unreadCount = count;
      this.assignCounts(index + 1);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(SourcesStore, import.meta.hot));
}
