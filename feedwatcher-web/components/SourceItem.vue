<template>
  <article class="sourceitem-layout">
    <div class="sourceitem-layout-date" v-on:click="clickedItem()">{{ relativeTime(item.datePublished) }}</div>
    <div
      class="sourceitem-layout-title"
      v-on:click="clickedItem()"
      :class="{ 'sourceitem-read': item.status == 'read' }"
    >
      {{ item.title }}
    </div>
    <div class="sourceitem-layout-link">
      <a :href="item.url" target="_blank"><i class="bi bi-link"></i></a>
    </div>
    <div
      :class="{ 'sourceitem-active': isActive, 'sourceitem-notactive': !isActive }"
      class="sourceitem-layout-content"
    >
      <div class="sourceitem-actions actions">
        <i v-if="isSaved" class="bi bi-bookmark-check-fill" v-on:click="unSaveItem()"></i>
        <i v-else class="bi bi-bookmark-plus" v-on:click="saveItem()"></i>
      </div>
      <span v-html="item.content"></span>
    </div>
  </article>
</template>

<script>
import axios from "axios";
import { handleError, EventBus, EventTypes } from "../services/EventBus";
import Config from "../services/Config.ts";
import { AuthService } from "../services/AuthService";

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
  methods: {
    async clickedItem() {
      this.isActive = !this.isActive;
      if (this.isActive) {
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
      }
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/sources/items/${this.item.id}/status`,
          { status: "read" },
          await AuthService.getAuthHeader()
        )
        .then((res) => {
          this.item.status = "read";
          this.$emit("onItemUpdated", { item: this.item });
        })
        .catch(handleError);
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
          this.$emit("onItemUpdated", { item: this.item });
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
  padding-bottom: 1em;
  border-top: 2px solid #333;
  padding-top: 1em;
  margin-top: 1em;
}
.sourceitem-notactive {
  height: 0px;
}
.sourceitem-layout {
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: auto 1fr auto;
  height: calc(100vh - 5em);
  width: 100%;
  height: auto;
  grid-gap: 0.5em;
  padding: 0.5em;
  margin: 0.5em 0;
}
.sourceitem-layout-date {
  grid-row: 1;
  grid-column: 1;
  font-size: 70%;
  padding-top: 0.4em;
  color: #666;
}
.sourceitem-layout-title {
  grid-row: 1;
  grid-column: 2;
}
.sourceitem-layout-link {
  grid-row: 1;
  grid-column: 3;
}
.sourceitem-layout-content {
  grid-row: 2;
  grid-column-start: 1;
  grid-column-end: span 3;
  overflow: hidden;
}
.sourceitem-read {
  color: #666;
}
.sourceitem-actions {
  font-size: 0.9em;
  margin-bottom: 0.5em;
  text-align: right;
}
@media (prefers-color-scheme: dark) {
  .sourceitem-read {
    color: #666;
  }
}
@media (prefers-color-scheme: light) {
  .sourceitem-read {
    color: #ccc;
  }
}
</style>
