<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h4>Sources</h4>
    </div>
    <div id="sources-actions" class="actions">
      <i
        class="bi bi-cloud-arrow-down"
        :class="{ blink: userProcessorInfoStore.status !== 'idle' }"
        v-on:click="refreshAndFetch()"
      ></i>
      <i class="bi bi-arrow-clockwise" v-on:click="refresh()"></i>
      <NuxtLink to="/sources/new"><i class="bi bi-plus-square"></i></NuxtLink>
      <i
        class="bi bi-caret-up-square sources-actions-menu-toggle"
        v-if="menuOpened"
        v-on:click="openListMenu()"
      ></i>
      <i
        class="bi bi-caret-down-square sources-actions-menu-toggle"
        v-else
        v-on:click="openListMenu()"
      ></i>
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
      <input
        id="sources-items-search-filter"
        class="source-filter-input"
        v-model="searchText"
        type="search"
        placeholder="Filter items…"
        @search="onSearchInput"
      />
      <NuxtLink
        v-if="sourceItemsStore.selectedSource"
        :to="'/sources/' + sourceItemsStore.selectedSource"
        ><i class="bi bi-pencil-square"></i
      ></NuxtLink>
      <i
        v-if="sourceItemsStore.sourceItems.length > 0"
        v-on:click="markAllRead()"
        class="bi bi-archive"
      ></i>
      <i
        v-if="filterStatus == 'unread'"
        v-on:click="toggleUnreadFIlter()"
        class="bi bi-envelope"
      ></i>
      <i
        v-else
        v-on:click="toggleUnreadFIlter()"
        class="bi bi-envelope-open"
      ></i>
    </div>
    <div id="sources-items-list-page">
      <div
        class="item-list-card"
        v-for="sourceItem in sourceItemsStore.sourceItems"
        v-bind:key="sourceItem.id"
      >
        <LazySourceItem
          class="fade-in-fast item-list-card"
          :item="sourceItem"
        />
      </div>
      <div id="sources-items-list-page-next">
        <Loading v-if="sourceItemsStore.loading" />
        <span
          v-if="
            sourceItemsStore.sourceItems.length == 0 &&
            !sourceItemsStore.loading
          "
          >No items</span
        >
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
import { debounce } from "lodash";

export default {
  data() {
    return {
      selectedSource: "",
      menuOpened: true,
      filterStatus: "unread",
      markingUnreead: false,
      searchText: "",
      scrollObserver: null,
    };
  },
  async created() {
    if (!(await AuthenticationStore().ensureAuthenticated())) {
      useRouter().push({ path: "/users" });
    }
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      if (
        SourceItemsStore().sourceItems.length === 0 &&
        UserProcessorInfoStore().status === "idle"
      ) {
        SourceItemsStore().fetch();
      }
    });
    this.onRootSelected();
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
  mounted() {
    this.setupInfiniteScroll();
  },
  beforeUnmount() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
  },
  methods: {
    async onSourceSelected(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = source.sourceId;
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
        query[sourceItemsStore.searchCriteria] =
          sourceItemsStore.searchCriteriaValue;
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
        .put(
          `${(await Config.get()).SERVER_URL}/sources/fetch`,
          {},
          await AuthService.getAuthHeader(),
        )
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
            await AuthService.getAuthHeader(),
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
    onSearchInput: debounce(function () {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.searchPattern = this.searchText;
      sourceItemsStore.fetch();
    }, 300),
    clearSearchInput() {
      this.searchText = "";
      SourceItemsStore().searchPattern = "";
      SourceItemsStore().fetch();
    },
    setupInfiniteScroll() {
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
      }
      const store = SourceItemsStore();
      const scrollRoot = document.getElementById("sources-items-list-page");
      const sentinel = document.getElementById("sources-items-list-page-next");
      this.scrollObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting && store.pageHasMore && !store.loadingMore) {
            store.fetchMore();
          }
        },
        { root: scrollRoot, rootMargin: "0px" },
      );
      if (sentinel) {
        this.scrollObserver.observe(sentinel);
      }
    },
    toggleUnreadFIlter() {
      if (this.filterStatus === "all") {
        this.filterStatus = "unread";
      } else {
        this.filterStatus = "all";
      }
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.fetch();
    },
  },
  watch: {
    searchText() {
      this.onSearchInput();
    },
  },
};
</script>

<style scoped>
#sources-items-list-page {
  grid-row: 4;
  grid-column: 1 / 3;
  display: flex;
  align-items: flex-start;
  align-content: flex-start;
  flex-wrap: wrap;
  gap: var(--space-md);
}

@media (min-width: 701px) {
  #sources-items-list-page {
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
    overflow: auto;
  }
}

#sources-items-list-page-next {
  width: 100%;
}
</style>
