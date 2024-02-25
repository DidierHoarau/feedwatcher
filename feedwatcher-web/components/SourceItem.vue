<template>
  <article class="sourceitem-layout">
    <div class="sourceitem-layout-read-status">
      <i
        v-if="item.status == 'read'"
        class="bi bi-envelope-open source-action"
        v-on:click="markReadStatus('unread')"
      ></i>
      <i v-else class="bi bi-envelope source-action" v-on:click="markReadStatus('read')"></i>

      <br />

      <i v-if="isSaved" class="bi bi-bookmark-check-fill source-action" v-on:click="unSaveItem()"></i>
      <i v-else class="bi bi-bookmark-plus source-action" v-on:click="saveItem()"></i>
    </div>

    <div
      class="sourceitem-layout-title"
      v-on:click="clickedItem()"
      :class="{ 'sourceitem-read': item.status == 'read' }"
    >
      <span class="sourceitem-date">{{ relativeTime(item.datePublished) }}</span>
      {{ item.title }}
    </div>

    <div class="sourceitem-layout-link">
      <a :href="item.url" target="_blank" v-on:click="markReadStatus('read')"
        ><i class="bi bi-link source-action"></i
      ></a>
    </div>

    <div class="sourceitem-layout-meta">
      {{ item.sourceName }}
    </div>

    <div
      :class="{ 'sourceitem-active': isActive, 'sourceitem-notactive': !isActive }"
      class="sourceitem-layout-content"
    >
      <Transition>
        <span v-if="isActive" v-html="item.content"></span>
      </Transition>
    </div>
  </article>
</template>

<script>
import axios from "axios";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";

export default {
  props: {
    item: {},
  },
  data() {
    return {
      isActive: false,
      isSaved: false,
    };
  },
  async created() {
    axios
      .get(`${(await Config.get()).SERVER_URL}/lists/items/${this.item.id}`, await AuthService.getAuthHeader())
      .then((res) => {
        if (res.data.id) {
          this.isSaved = true;
        } else {
          this.isSaved = false;
        }
      })
      .catch(handleError);
  },
  methods: {
    async clickedItem() {
      this.isActive = !this.isActive;
      if (this.isActive) {
        this.markReadStatus("read");
      }
    },
    async saveItem() {
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/lists/items`,
          { itemId: this.item.id },
          await AuthService.getAuthHeader()
        )
        .then((res) => {
          this.isSaved = true;
        })
        .catch(handleError);
    },
    async unSaveItem() {
      axios
        .delete(`${(await Config.get()).SERVER_URL}/lists/items/${this.item.id}`, await AuthService.getAuthHeader())
        .then((res) => {
          this.isSaved = false;
        })
        .catch(handleError);
    },
    async markReadStatus(status) {
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/items/status`,
          { status, itemIds: [this.item.id] },
          await AuthService.getAuthHeader()
        )
        .then((res) => {
          this.item.status = status;
          EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        })
        .catch(handleError);
    },
    relativeTime(date) {
      const delta = Math.round((new Date() - new Date(date)) / 1000);
      const minute = 60,
        hour = minute * 60,
        day = hour * 24,
        week = day * 7,
        month = day * 30,
        year = day * 365;
      if (delta < 60) {
        return "just now";
      } else if (delta < hour) {
        return Math.floor(delta / minute) + " minutes ago";
      } else if (delta < 2 * hour) {
        return "1 hour ago";
      } else if (delta < day) {
        return Math.floor(delta / hour) + " hours ago";
      } else if (delta < 2 * day) {
        return "1 day ago";
      } else if (delta < week) {
        return Math.floor(delta / day) + " days ago";
      } else if (delta < 2 * week) {
        return "1 week ago";
      } else if (delta < month) {
        return Math.floor(delta / week) + " weeks ago";
      } else if (delta < 2 * month) {
        return "1 month ago";
      } else if (delta < year) {
        return Math.floor(delta / month) + " months ago";
      } else if (delta < 2 * year) {
        return "1 year ago";
      } else {
        return Math.floor(delta / year) + " years ago";
      }
    },
  },
};
</script>

<style scoped>
.sourceitem-active {
  height: auto;
  border-top: 2px solid #333;
  padding-top: 0.6em;
}
.sourceitem-notactive {
  height: 0px;
}
.sourceitem-layout {
  display: grid;
  grid-template-rows: auto auto 1fr;
  grid-template-columns: auto 1fr auto;
  height: calc(100vh - 5em);
  width: 100%;
  height: auto;
  grid-gap: 0.5em;
  padding: 0.5em 0.6em;
  margin: 0.5em 0;
}
.sourceitem-layout-title {
  grid-row: 1;
  grid-column: 2;
}
.sourceitem-layout-read-status {
  grid-row-start: 1;
  grid-row-end: span 3;
  grid-column: 1;
  text-align: center;
  padding: 0.5em;
  background-color: #33333344;
}
.sourceitem-layout-link {
  grid-row: 1;
  grid-column: 3;
  text-align: right;
  padding-left: 0.5em;
}
.sourceitem-layout-content {
  grid-row: 3;
  grid-column-start: 2;
  grid-column-end: span 2;
  overflow: hidden;
}
.sourceitem-layout-save {
  grid-row: 3;
  grid-column: 1;
  text-align: center;
  padding-right: 0.5em;
  padding-top: 0.7em;
}
.sourceitem-actions {
  font-size: 0.7em;
  margin-bottom: 0.5em;
  text-align: right;
}
.sourceitem-layout-meta {
  grid-row: 2;
  grid-column-start: 2;
  grid-column-end: span 2;
  font-size: 0.5em;
  text-align: right;
}
.sourceitem-date {
  font-size: 0.7em;
  padding-right: 0.6em;
}
.sourceitem-read,
.sourceitem-date,
.sourceitem-read,
.sourceitem-layout-meta {
  opacity: 0.5;
}
.source-action {
  font-size: 1.4em;
}

.v-enter-active,
.v-leave-active {
  transition: opacity 1s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
