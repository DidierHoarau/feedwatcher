<template>
  <div id="sources-layout">
    <div id="sources-header">
      <h2>Sources</h2>
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
      <SourceList />
    </div>
    <div id="sources-items-actions" class="actions">
      <NuxtLink v-if="sourceItemsStore.selectedSource" :to="'/sources/' + sourceItemsStore.selectedSource"
        ><i class="bi bi-pencil-square"></i
      ></NuxtLink>
      <i v-if="sourceItemsStore.sourceItems.length > 0" v-on:click="markAllRead()" class="bi bi-archive"></i>
      <i v-if="sourceItemsStore.filterStatus == 'unread'" v-on:click="toggleUnreadFIlter()" class="bi bi-envelope"></i>
      <i v-else v-on:click="toggleUnreadFIlter()" class="bi bi-envelope-open"></i>
    </div>
    <div id="sources-items-list">
      <div id="sources-items-list-page">
        <div v-for="sourceItem in sourceItemsStore.sourceItems" v-bind:key="sourceItem.id">
          <SourceItem class="fade-in-fast" :item="sourceItem" />
        </div>
        <div v-on:click="pageNext()" id="sources-items-list-page-next">
          <Loading v-if="sourceItemsStore.loading" />
          <span v-if="sourceItemsStore.sourceItems.length == 0 && !sourceItemsStore.loading">No items</span>
          <i v-if="sourceItemsStore.pageHasMore && !sourceItemsStore.loading" class="bi bi-caret-down"></i>
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
import * as _ from "lodash";
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
  },
  methods: {
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
      const sourceItemsStore = SourceItemsStore();
      if (sourceItemsStore.filterStatus === "unread") {
        sourceItemsStore.filterStatus = "all";
      } else {
        sourceItemsStore.filterStatus = "unread";
      }
      sourceItemsStore.page = 1;
      sourceItemsStore.fetch();
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
  padding-top: 0.2em;
  padding-bottom: 0.2em;
}

@media (max-width: 700px) {
  #sources-layout {
    display: grid;
    grid-template-rows: 4em auto 3em 2fr;
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
    grid-template-rows: 4em 3em 1fr;
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
  grid-template-columns: 1fr;
  overflow: hidden;
  align-items: center;
}
#sources-items-list-page-next {
  padding-bottom: 0.6em;
  padding-top: 0.6em;
  text-align: center;
}
.page-inactive {
  opacity: 0.1;
}

#sources-items-list-page {
  height: 100%;
  overflow-y: auto;
}
</style>
