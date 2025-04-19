import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import axios from "axios";
import { find, findIndex, sortBy } from "lodash";
import { PreferencesLabels } from "~~/services/PreferencesLabels";

export const SourcesStore = defineStore("SourcesStore", {
  state: () => ({
    sourcesStr: "",
    sources: [],
    selectedIndex: -1,
    sourceCounts: [],
    savedCounts: [],
    selectedSourceId: "",
    selectedLabel: "",
    selectedRoot: true,
  }),

  getters: {},

  actions: {
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
        const position = findIndex(this.sources, { sourceId: this.selectedSourceId });
        if (position < 0) {
          return;
        }
        this.selectedIndex = position;
        return;
      }
      if (this.selectedLabel !== "") {
        const position = findIndex(this.sources, { labelName: this.selectedLabel, isLabel: true });
        if (position < 0) {
          return;
        }
        this.selectedIndex = position;
        return;
      }
    },
    async fetch() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels`, await AuthService.getAuthHeader())
        .then((res) => {
          const sourcesData = sortBy(res.data.sourceLabels, ["labelName", "sourceName"]);
          const soucesStr = JSON.stringify(sourcesData);
          if (this.sourcesStr === soucesStr) {
            this.checkVisibility();
            assignCounts(this.sources, this.sourceCounts, "unreadCount");
            assignCounts(this.sources, this.savedCounts, "savedCount");
            return this.fetchCounts();
          }
          this.sourcesStr = soucesStr;
          const sourcesTmp: any[] = [];
          sourcesTmp.push({
            isLabel: true,
            isRoot: true,
            depth: 0,
            name: "All",
            displayName: "All",
            labelName: "",
            unreadCount: 0,
            savedCount: 0,
            isCollapsed: false,
            isVisible: true,
          });
          for (let i = 0; i < sourcesData.length; i++) {
            const sourceData = sourcesData[i];
            const source: any = {};
            let labelSplit = [];
            if (sourceData.labelName) {
              labelSplit = sourceData.labelName.split("/");
            }
            if (labelSplit.length > 0 && sourceData.labelName !== sourcesTmp[sourcesTmp.length - 1].labelName) {
              const parentLabelSplit = sourcesTmp[sourcesTmp.length - 1].labelName.split("/");
              let labelName = "";
              for (let j = 0; j < labelSplit.length; j++) {
                if (labelName !== "") {
                  labelName += "/";
                }
                labelName += labelSplit[j];
                if (j == labelSplit.length - 1) {
                  sourcesTmp.push({
                    isLabel: true,
                    depth: labelSplit.length,
                    labelName: sourceData.labelName,
                    displayName: labelSplit[labelSplit.length - 1],
                    unreadCount: 0,
                    savedCount: 0,
                    isCollapsed: PreferencesLabels.isCollapsed(sourceData.labelName),
                    isVisible: false,
                  });
                } else if (j >= parentLabelSplit.length || parentLabelSplit[j] !== labelSplit[j]) {
                  sourcesTmp.push({
                    isLabel: true,
                    depth: j + 1,
                    labelName: labelName,
                    displayName: labelSplit[j],
                    unreadCount: 0,
                    savedCount: 0,
                    isCollapsed: PreferencesLabels.isCollapsed(labelName),
                    isVisible: false,
                  });
                }
              }
            }
            sourcesTmp.push({
              sourceId: sourceData.sourceId,
              isLabel: false,
              isRoot: false,
              depth: labelSplit.length + 1,
              name: sourceData.sourceName,
              icon: sourceData.sourceInfo.icon,
              labelName: sourceData.labelName || "",
              displayName: sourceData.sourceName,
              unreadCount: 0,
              savedCount: 0,
              isCollapsed: false,
              isVisible: false,
            });
          }
          this.sources = sourcesTmp as never[];
          assignCounts(this.sources, this.sourceCounts, "unreadCount");
          assignCounts(this.sources, this.savedCounts, "savedCount");
          this.checkVisibility();
          this.updateSelectedIndex();
          return this.fetchCounts();
        })
        .catch(handleError);
    },
    async fetchCounts() {
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels/counts/unread`, await AuthService.getAuthHeader())
        .then((res) => {
          this.sourceCounts = res.data.counts;
          assignCounts(this.sources, this.sourceCounts, "unreadCount");
        })
        .catch(handleError);
      await axios
        .get(`${(await Config.get()).SERVER_URL}/sources/labels/counts/saved`, await AuthService.getAuthHeader())
        .then((res) => {
          this.savedCounts = res.data.counts;
          assignCounts(this.sources, this.savedCounts, "savedCount");
        })
        .catch(handleError);
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
      let parentCollapsedLabel = "";
      for (let i = 0; i < this.sources.length; i++) {
        const source = this.sources[i] as any;
        if (parentCollapsedLabel && `${source.labelName}/`.indexOf(parentCollapsedLabel) === 0) {
          source.isVisible = false;
        } else if (source.isLabel && !source.isCollapsed) {
          source.isVisible = true;
        } else if (source.isLabel && source.isCollapsed) {
          source.isVisible = true;
          parentCollapsedLabel = source.labelName;
        } else {
          source.isVisible = true;
        }
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(SourcesStore, import.meta.hot));
}

function assignCounts(sources: any[], counts: any[], field: string, index = 0) {
  if (index >= sources.length) {
    return;
  }
  const source: any = sources[index];
  if (!source.isLabel) {
    const foundCount = find(counts, { sourceId: source.sourceId });
    if (foundCount) {
      source[field] = foundCount[field];
    } else {
      source[field] = 0;
    }
    assignCounts(sources, counts, field, index + 1);
    return;
  }
  let nextIteration = index + 1;
  let count = 0;
  while (nextIteration < sources.length) {
    const sourceNext = sources[nextIteration] as any;
    if (!sourceNext.isLabel && sourceNext.labelName.indexOf(source.labelName) === 0) {
      const sourceCounNext = find(counts, { sourceId: sourceNext.sourceId });
      if (sourceCounNext) {
        count += sourceCounNext[field];
      }
    }
    nextIteration++;
  }
  source[field] = count;
  assignCounts(sources, counts, field, index + 1);
}
