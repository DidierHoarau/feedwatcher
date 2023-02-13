<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h2>Sources</h2>
    </div>
    <div id="sources-actions" class="actions">
      <i class="bi bi-cloud-arrow-down" v-on:click="refreshAndFetch()"></i>
      <i class="bi bi-arrow-clockwise" v-on:click="refresh()"></i>
      <NuxtLink to="/sources/new"><i class="bi bi-plus-square"></i></NuxtLink>
      <i class="bi bi-caret-up-square sources-actions-menu-toggle" v-if="menuOpened" v-on:click="openListMenu()"></i>
      <i class="bi bi-caret-down-square sources-actions-menu-toggle" v-else v-on:click="openListMenu()"></i>
    </div>
    <div id="sources-list" :class="{ 'sources-list-closed': !menuOpened }">
      <SourceList />
    </div>
    <div id="sources-items-actions" class="actions">
      <NuxtLink v-if="activeSourceItems.selectedSource" :to="'/sources/' + activeSourceItems.selectedSource"
        ><i class="bi bi-pencil-square"></i
      ></NuxtLink>
      <i
        v-if="activeSourceItems.selectedSource"
        v-on:click="refreshSourceItems(selectedSource)"
        class="bi bi-cloud-arrow-down"
      ></i>
      <i v-if="activeSourceItems.sourceItems.length > 0" v-on:click="markAllRead()" class="bi bi-archive"></i>
      <i
        v-if="activeSourceItems.filterStatus == 'unread'"
        v-on:click="toggleUnreadFIlter()"
        class="bi bi-eye-slash"
      ></i>
      <i v-else v-on:click="toggleUnreadFIlter()" class="bi bi-eye"></i>
    </div>
    <div id="sources-items-list">
      <div
        v-on:click="pagePrevious()"
        id="sources-items-list-page-prev"
        :class="{ 'page-inactive': activeSourceItems.page == 1 }"
      >
        <i class="bi bi-caret-left"></i>
      </div>
      <div id="sources-items-list-page">
        <span v-if="activeSourceItems.sourceItems.length == 0">No items</span>
        <div v-for="sourceItem in activeSourceItems.sourceItems" v-bind:key="sourceItem.id">
          <SourceItem :item="sourceItem" />
        </div>
      </div>
      <div
        v-on:click="pageNext()"
        id="sources-items-list-page-next"
        :class="{ 'page-inactive': !activeSourceItems.pageHasMore }"
      >
        <i class="bi bi-caret-right"></i>
      </div>
    </div>
  </div>
</template>

<script setup>
const activeSourceItems = ActiveSourceItems();
</script>

<script>
import axios from "axios";
import * as _ from "lodash";
import Config from "../../services/Config.ts";
import { Timeout } from "../../services/Timeout.ts";
import { AuthService } from "../../services/AuthService";
import { handleError, EventBus, EventTypes } from "../../services/EventBus";

export default {
  data() {
    return {
      sourceItems: [],
      selectedSource: "",
      menuOpened: true,
      filterStatus: "unread",
    };
  },
  async created() {},
  methods: {
    async refreshSourceItems(sourceId) {
      this.selectedSource = sourceId;
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/${sourceId}/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
    },
    async refreshAndFetch() {
      await axios
        .put(`${(await Config.get()).SERVER_URL}/sources/fetch`, {}, await AuthService.getAuthHeader())
        .then((res) => {})
        .catch(handleError);
      EventBus.emit(EventTypes.SOURCES_UPDATED, {});
    },
    async refresh() {
      EventBus.emit(EventTypes.SOURCES_UPDATED, {});
    },
    async markAllRead() {
      const activeSourceItems = ActiveSourceItems();
      let confirmed = false;
      if (activeSourceItems.sourceItems.length > 1) {
        confirmed = confirm("Mark all item read?");
      } else {
        confirmed = true;
      }
      if (confirmed === true) {
        for (const item of activeSourceItems.sourceItems) {
          await axios
            .put(
              `${(await Config.get()).SERVER_URL}/sources/items/${item.id}/status`,
              { status: "read" },
              await AuthService.getAuthHeader()
            )
            .then((res) => {
              item.status = "read";
            })
            .catch(handleError);
        }
        EventBus.emit(EventTypes.ITEMS_UPDATED, {});
      }
    },
    openListMenu() {
      this.menuOpened = !this.menuOpened;
    },
    pagePrevious() {
      const activeSourceItems = ActiveSourceItems();
      if (activeSourceItems.page == 1) {
        return;
      }
      activeSourceItems.page--;
      activeSourceItems.fetchItems();
    },
    pageNext() {
      const activeSourceItems = ActiveSourceItems();
      if (!activeSourceItems.pageHasMore) {
        return;
      }
      activeSourceItems.page++;
      activeSourceItems.fetchItems();
    },
    toggleUnreadFIlter() {
      const activeSourceItems = ActiveSourceItems();
      if (activeSourceItems.filterStatus === "unread") {
        activeSourceItems.filterStatus = "all";
      } else {
        activeSourceItems.filterStatus = "unread";
      }
      activeSourceItems.page = 1;
      activeSourceItems.fetchItems();
    },
  },
};
</script>

<style scoped>
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
}

@media (max-width: 700px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 4em auto 2em 2fr;
    grid-template-columns: auto auto;
    height: calc(100vh - 5em);
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 3;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-items-list {
    overflow: scroll;
    grid-row: 4;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
  #sources-header {
    grid-row: 1;
    grid-column: 1;
  }
  #sources-list {
    overflow: auto;
    height: 30vh;
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
    grid-template-rows: 4em 2em 1fr;
    grid-template-columns: auto 1fr 1fr;
    height: calc(100vh - 5em);
    column-gap: 1em;
  }
  #sources-items-actions {
    grid-row: 2;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
  #sources-items-list {
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
    grid-row-start: 2;
    grid-row-end: span 2;
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
  grid-template-columns: auto 1fr auto;
}
#sources-items-list-page-prev,
#sources-items-list-page-next {
  padding: 8em 0.6em;
}
.page-inactive {
  opacity: 0.1;
}
</style>
