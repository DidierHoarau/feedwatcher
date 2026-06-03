<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h4>Bookmarks</h4>
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
      <LazySourceList
        displayCount="savedCount"
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
        placeholder="Filter bookmarks…"
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
    <div id="sources-items-list">
      <div id="sources-items-list-page">
        <div
          v-for="sourceItem in sourceItemsStore.sourceItems"
          v-bind:key="sourceItem.id"
        >
          <LazySourceItem class="fade-in-fast" :item="sourceItem" />
        </div>
        <div v-on:click="pageNext()" id="sources-items-list-page-next">
          <Loading v-if="sourceItemsStore.loading" />
          <span
            v-if="
              sourceItemsStore.sourceItems.length == 0 &&
              !sourceItemsStore.loading
            "
            >No items</span
          >
          <i
            v-if="sourceItemsStore.pageHasMore && !sourceItemsStore.loading"
            class="bi bi-caret-down"
          ></i>
        </div>
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
      filterStatus: "all",
      markingUnreead: false,
      searchText: "",
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
  },
  methods: {
    async onSourceSelected(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = source.sourceId;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "sourceId";
      sourceItemsStore.searchCriteriaValue = source.sourceId;
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.filterSaved = true;
      sourceItemsStore.fetch();
    },
    async onLabelSelected(source) {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "labelName";
      sourceItemsStore.searchCriteriaValue = source.labelName;
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.filterSaved = true;
      sourceItemsStore.fetch();
    },
    async onRootSelected() {
      const sourceItemsStore = SourceItemsStore();
      sourceItemsStore.selectedSource = null;
      sourceItemsStore.page = 1;
      sourceItemsStore.searchCriteria = "all";
      sourceItemsStore.filterStatus = this.filterStatus;
      sourceItemsStore.filterSaved = true;
      sourceItemsStore.fetch();
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
      sourceItemsStore.page = 1;
      sourceItemsStore.fetch();
    }, 300),
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
  watch: {
    searchText() {
      this.onSearchInput();
    },
  },
};
</script>

<style scoped>
@media (max-width: 700px) {
  #sources-items-list {
    overflow: scroll;
    grid-row: 4;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
}

@media (min-width: 701px) {
  #sources-items-list {
    overflow: auto;
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
}
</style>
