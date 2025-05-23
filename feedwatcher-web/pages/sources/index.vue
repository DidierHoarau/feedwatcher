<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h3>Sources</h3>
    </div>
    <div id="sources-actions" class="actions">
      <i
        class="bi bi-cloud-arrow-down"
        :class="{ blink: userProcessorInfoStore.status !== 'idle' }"
        v-on:click="refreshAndFetch()"
      ></i>
      <i class="bi bi-arrow-clockwise" v-on:click="refresh()"></i>
      <NuxtLink to="/sources/new"><i class="bi bi-plus-square"></i></NuxtLink>
      <i class="bi bi-caret-up-square sources-actions-menu-toggle" v-if="menuOpened" v-on:click="openListMenu()"></i>
      <i class="bi bi-caret-down-square sources-actions-menu-toggle" v-else v-on:click="openListMenu()"></i>
    </div>
    <div id="sources-list" :class="{ 'sources-list-closed': !menuOpened }">
      <SourceList
        displayCount="unreadCount"
        @onSourceSelected="onSourceSelected"
        @onLabelSelected="onLabelSelected"
        @onRootSelected="onRootSelected"
      />
    </div>
    <div id="sources-items-actions" class="actions">
      <NuxtLink v-if="sourceItemsStore.selectedSource" :to="'/sources/' + sourceItemsStore.selectedSource"
        ><i class="bi bi-pencil-square"></i
      ></NuxtLink>
      <i v-if="sourceItemsStore.sourceItems.length > 0" v-on:click="markAllRead()" class="bi bi-archive"></i>
      <i v-if="filterStatus == 'unread'" v-on:click="toggleUnreadFIlter()" class="bi bi-envelope"></i>
      <i v-else v-on:click="toggleUnreadFIlter()" class="bi bi-envelope-open"></i>
    </div>
    <div id="sources-items-list-page">
      <div
        class="sources-items-list-item-container"
        v-for="sourceItem in sourceItemsStore.sourceItems"
        v-bind:key="sourceItem.id"
      >
        <SourceItem class="fade-in-fast sources-items-list-item" :item="sourceItem" />
      </div>
      <div v-on:click="pageNext()" id="sources-items-list-page-next">
        <Loading v-if="sourceItemsStore.loading" />
        <span v-if="sourceItemsStore.sourceItems.length == 0 && !sourceItemsStore.loading">No items</span>
        <i v-if="sourceItemsStore.pageHasMore && !sourceItemsStore.loading" class="bi bi-caret-down"></i>
      </div>
    </div>
  </div>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const userProcessorInfoStore = UserProcessorInfoStore();
</script>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import { Timeout } from "~~/services/Timeout";

export default {
  data() {
    return {
      selectedSource: "",
      menuOpened: true,
      filterStatus: "unread",
      markingUnreead: false,
    };
  },
  async created() {
    if (!(await AuthenticationStore().ensureAuthenticated())) {
      useRouter().push({ path: "/users" });
    }
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      if (SourceItemsStore().sourceItems.length === 0 && UserProcessorInfoStore().status === "idle") {
        SourceItemsStore().fetch();
      }
    });
    this.onRootSelected();
    if (useRoute().query.filterStatus) {
      this.filterStatus = useRoute().query.filterStatus;
    }
    if (useRoute().query.filterStatus) {
      this.filterStatus = useRoute().query.filterStatus;
    }
    if (useRoute().query.sourceId) {
      this.onSourceSelected({ sourceId: useRoute().query.sourceId });
    } else if (useRoute().query.labelName) {
      this.onLabelSelected({ labelName: useRoute().query.labelName });
    } else {
      this.onRootSelected();
    }
  },
  methods: {
    async onSourceSelected(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = source.sourceId;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "sourceId";
      sourceItemsStore.searchCriteriaValue = source.sourceId;
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.filterSaved = false;
      sourceItemsStore.fetch();
      SourcesStore().setSelectedSourceId(source.sourceId);
      this.updateRouteQuery();
    },
    async onLabelSelected(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "labelName";
      sourceItemsStore.searchCriteriaValue = source.labelName;
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.filterSaved = false;
      sourceItemsStore.fetch();
      SourcesStore().setSelectedLabel(source.labelName);
      this.updateRouteQuery();
    },
    async onRootSelected() {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "all";
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.filterSaved = false;
      sourceItemsStore.fetch();
      SourcesStore().setSelectedRoot();
      this.updateRouteQuery();
    },
    updateRouteQuery() {
      const sourceItemsStore = SourceItemsStore();
      const query = {};
      if (sourceItemsStore.searchCriteria !== "all") {
        query[sourceItemsStore.searchCriteria] = sourceItemsStore.searchCriteriaValue;
      }
      if (sourceItemsStore.filterStatus !== "unread") {
        query.filterStatus = sourceItemsStore.filterStatus;
      }
      if (sourceItemsStore.filterSaved) {
        query.filterSaved = sourceItemsStore.filterSaved;
      }
      useRouter().push({ query });
    },
    async refreshAndFetch() {
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
      UserProcessorInfoStore().check();
    },
    async refresh() {
      SourceItemsStore().fetch();
      UserProcessorInfoStore().check();
      SourcesStore().fetch();
    },
    async markAllRead() {
      const sourceItemsStore = SourceItemsStore();
      let confirmed = false;
      if (sourceItemsStore.sourceItems.length > 1) {
        confirmed = confirm("Mark all item read?");
      } else {
        confirmed = true;
      }
      if (confirmed === true) {
        const itemIds = [];
        for (const item of sourceItemsStore.sourceItems) {
          itemIds.push(item.id);
        }
        await axios
          .put(
            `${(await Config.get()).SERVER_URL}/items/status`,
            { status: "read", itemIds },
            await AuthService.getAuthHeader()
          )
          .then(() => {
            for (const item of sourceItemsStore.sourceItems) {
              item.status = "read";
            }
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              text: "All displayed items marked as read",
            });
            EventBus.emit(EventTypes.ITEMS_UPDATED, {});
            return Timeout.wait(1000);
          })
          .then(() => {
            sourceItemsStore.fetch();
          })
          .catch(handleError);
      }
    },
    openListMenu() {
      this.menuOpened = !this.menuOpened;
    },
    pageNext() {
      const sourceItemsStore = SourceItemsStore();
      if (!sourceItemsStore.pageHasMore) {
        return;
      }
      sourceItemsStore.page++;
      sourceItemsStore.fetchMore();
    },
    toggleUnreadFIlter() {
      if (this.filterStatus === "all") {
        this.filterStatus = "unread";
      } else {
        this.filterStatus = "all";
      }
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.page = 1;
      sourceItemsStore.fetch();
    },
  },
};
</script>

<style scoped>
#sources-items-list-page {
  grid-row: 4;
  grid-column: 1 / 3;
  gap: 0.6em;
  display: flex;
  align-items: flex-start;
  align-content: flex-start;
  flex-wrap: wrap;
}

#sources-layout > * {
  min-height: 0px;
}
#sources-actions {
  text-align: right;
  white-space: nowrap;
}
#sources-list div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#sources-items-actions {
  text-align: right;
  font-size: 0.9em;
  padding-top: 0.2em;
  padding-bottom: 0.2em;
}

@media (max-width: 700px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 2.7em auto 3em 2fr;
    grid-template-columns: auto auto;
    height: calc(100vh - 5em);
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 3;
    grid-column-start: 1;
    grid-column-end: span 2;
    display: flex;
    justify-content: right;
    align-items: center;
  }
  #sources-items-list {
  }
  #sources-header {
    grid-row: 1;
    grid-column: 1;
  }
  #sources-list {
    overflow: auto;
    height: 25vh;
    grid-row: 2;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  .sources-list-closed {
    height: 0px !important;
  }
}

@media (min-width: 701px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 2.7em 3em 1fr;
    grid-template-columns: auto 1fr 1fr;
    height: calc(100vh - 5em);
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 2;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-items-list-page {
    overflow: auto;
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-header {
    grid-row: 1;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-list {
    width: 30vw;
    max-width: 20em;
    overflow: auto;
    height: auto;
    grid-row: 2 / 4;
    grid-column: 1;
  }
  .sources-actions-menu-toggle {
    visibility: hidden;
    font-size: 0px;
    padding: 0px;
    margin: 0px;
  }
}

@media (prefers-color-scheme: dark) {
  .source-active {
    background-color: #333;
  }
  #sources-list {
    background-color: #33333333;
  }
}
@media (prefers-color-scheme: light) {
  .source-active {
    background-color: #bbb;
  }
  #sources-list {
    background-color: #aaaaaa33;
  }
}

.source-name-layout {
  display: grid;
  grid-template-columns: auto 1fr auto;
  padding: 0.3em 0.5em;
}
.source-name-indent {
  grid-column: 1;
  padding-right: 0.5em;
}
.source-name-name {
  grid-column: 2;
}
.source-name-count {
  grid-column: 3;
}

#sources-items-list {
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  align-items: center;
}
#sources-items-list-page-next {
  padding-bottom: 0.6em;
  padding-top: 0.6em;
  text-align: center;
  height: 300;
  width: 100%;
}
.page-inactive {
  opacity: 0.1;
}

#sources-items-list-page {
  height: 100%;
  overflow-y: auto;
}

.sources-items-list-item-container {
  flex: 1 1 20em;
  min-width: 20em;
  align-self: flex-start;
}

.sources-items-list-item-container,
.sources-items-list-item {
  margin: 0;
  padding: 0;
}
</style>
