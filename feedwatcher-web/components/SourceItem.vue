<template>
  <article class="sourceitem-layout">
    <div class="sourceitem-layout-thumbnail">
      <div
        v-if="item.thumbnail"
        class="sourceitem-thumbnail"
        :style="{ backgroundImage: `url(${item.thumbnail})` }"
      ></div>
    </div>

    <div
      class="sourceitem-layout-title"
      v-on:click="clickedItem()"
      :class="{ 'sourceitem-read': item.status == 'read' }"
    >
      <span class="sourceitem-date">{{
        relativeTime(item.datePublished)
      }}</span>
      {{ item.title }}
    </div>

    <div class="sourceitem-layout-meta">
      {{ item.sourceName }}
    </div>

    <div class="sourceitem-actions-overlay">
      <button
        v-if="isPodcastItem"
        type="button"
        class="sourceitem-overlay-btn podcast-play-icon"
        :title="isCurrentlyPlaying ? 'Pause episode' : 'Play episode'"
        :aria-label="isCurrentlyPlaying ? 'Pause episode' : 'Play episode'"
        @click.stop="playPodcast()"
      >
        <i
          :class="
            isCurrentlyPlaying
              ? 'bi bi-pause-circle-fill'
              : 'bi bi-play-circle-fill'
          "
          class="source-action"
        ></i>
      </button>
      <button
        type="button"
        class="sourceitem-overlay-btn"
        :title="item.status == 'read' ? 'Mark as unread' : 'Mark as read'"
        :aria-label="item.status == 'read' ? 'Mark as unread' : 'Mark as read'"
        @click.stop="markReadStatus(item.status == 'read' ? 'unread' : 'read')"
      >
        <i
          :class="item.status == 'read' ? 'bi bi-envelope-open' : 'bi bi-envelope'"
          class="source-action"
        ></i>
      </button>
      <button
        type="button"
        class="sourceitem-overlay-btn"
        :title="isSaved ? 'Remove bookmark' : 'Save bookmark'"
        :aria-label="isSaved ? 'Remove bookmark' : 'Save bookmark'"
        @click.stop="isSaved ? unSaveItem() : saveItem()"
      >
        <i
          :class="isSaved ? 'bi bi-bookmark-check-fill' : 'bi bi-bookmark-plus'"
          class="source-action"
        ></i>
      </button>
      <button
        type="button"
        class="sourceitem-overlay-btn"
        title="Open link"
        aria-label="Open link"
        @click.stop="openItemLink()"
      >
        <i class="bi bi-box-arrow-up-right source-action"></i>
      </button>
    </div>

    <div
      :class="{
        'sourceitem-active': isActive,
        'sourceitem-notactive': !isActive,
      }"
      class="sourceitem-layout-content"
    >
      <Transition>
        <iframe
          v-if="isActive"
          class="sourceitem-content-frame"
          :srcdoc="iframeContent"
          sandbox="allow-same-origin allow-popups allow-scripts"
          scrolling="no"
          ref="contentFrame"
          @load="resizeFrame"
        ></iframe>
      </Transition>
    </div>
  </article>
</template>

<script>
import axios from "axios";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { PreferencesService } from "~~/services/PreferencesService";

export default {
  props: {
    item: {},
  },
  data() {
    return {
      isActive: false,
      isSaved: false,
      frameHeight: 200,
      autoMarkReadObserver: null,
      wasIntersected: false,
    };
  },
  computed: {
    isPodcastItem() {
      return !!(this.item?.info?.isPodcast && this.item?.info?.audioUrl);
    },
    isCurrentlyPlaying() {
      const store = PodcastPlayerStore();
      return store.currentItem?.id === this.item?.id && store.isPlaying;
    },
    iframeContent() {
      const isDark = (localStorage.getItem("UI_THEME") || "dark") === "dark";
      const bg = isDark ? "#11191f" : "#ffffff";
      const fg = isDark ? "#c2cfd6" : "#1a1a1a";
      const linkColor = isDark ? "#6ea8fe" : "#1a56db";
      return `<!DOCTYPE html><html><head><style>
        body { margin: 0; padding: 0.5em; font-family: sans-serif; font-size: 14px; word-break: break-word; overflow-wrap: break-word; background-color: ${bg}; color: ${fg}; }
        img { max-width: 100%; height: auto; }
        a { color: ${linkColor}; }
      </style></head><body>${this.item.content || ""}</body></html>`;
    },
  },
  mounted() {
    let lastKnownTop = null;
    this.autoMarkReadObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.wasIntersected = true;
          lastKnownTop = entry.boundingClientRect.top;
        } else if (this.wasIntersected && this.item.status === "unread") {
          const currentTop = entry.boundingClientRect.top;
          // Mark as read when the user scrolled down past the item
          // (element's top decreased / moved upward, or left the viewport entirely)
          if (
            currentTop < 0 ||
            (lastKnownTop !== null && currentTop < lastKnownTop)
          ) {
            if (PreferencesService.isAutoMarkReadEnabled()) {
              this.markReadStatus("read");
            }
            this.autoMarkReadObserver.disconnect();
          }
        }
      }
    });
    this.autoMarkReadObserver.observe(this.$el);
  },
  beforeUnmount() {
    if (this.autoMarkReadObserver) {
      this.autoMarkReadObserver.disconnect();
    }
  },
  async created() {
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/lists/items/${this.item.id}`,
        await AuthService.getAuthHeader(),
      )
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
    async playPodcast() {
      const store = PodcastPlayerStore();
      if (this.isCurrentlyPlaying) {
        store.pause();
      } else {
        store.play(this.item);
        useRouter().push({ path: "/podcast", query: { itemId: this.item.id } });
      }
    },
    async clickedItem() {
      const mode = PreferencesService.getOpenDetailsMode();
      switch (mode) {
        case "expand":
          this.isActive = !this.isActive;
          if (this.isActive) {
            this.markReadStatus("read");
          }
          break;
        case "dialog-summary":
          this.openItemDialog(false);
          break;
        case "dialog-full":
          this.openItemDialog(true);
          break;
        case "external":
          this.openItemExternal();
          break;
      }
    },
    async saveItem() {
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/lists/items`,
          { itemId: this.item.id },
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          this.isSaved = true;
          EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        })
        .catch(handleError);
    },
    async unSaveItem() {
      axios
        .delete(
          `${(await Config.get()).SERVER_URL}/lists/items/${this.item.id}`,
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          this.isSaved = false;
          EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        })
        .catch(handleError);
    },
    async openItemLink() {
      await this.markReadStatus("read");
      // Podcast items with no webpage URL: open the player page instead
      if (this.isPodcastItem && !this.item.url) {
        const store = PodcastPlayerStore();
        store.play(this.item);
        useRouter().push({ path: "/podcast", query: { itemId: this.item.id } });
        return;
      }
      const mode = PreferencesService.getOpenLinksMode();
      switch (mode) {
        case "dialog-summary":
          this.openItemDialog(false);
          break;
        case "dialog-full":
          this.openItemDialog(true);
          break;
        case "external":
          this.openItemExternal();
          break;
      }
    },
    openItemDialog(showFullSource) {
      EventBus.emit(EventTypes.OPEN_ITEM, { item: this.item, showFullSource });
    },
    openItemExternal() {
      if (this.item.url) {
        window.open(this.item.url, "_blank");
      }
    },
    async markReadStatus(status) {
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/items/status`,
          { status, itemIds: [this.item.id] },
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          this.item.status = status;
          EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        })
        .catch(handleError);
    },
    resizeFrame() {
      const frame = this.$refs.contentFrame;
      if (frame && frame.contentDocument && frame.contentDocument.body) {
        frame.style.height = frame.contentDocument.body.scrollHeight + "px";
      }
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
  border-top: 2px solid var(--color-border);
  padding-top: var(--space-md);
}
.sourceitem-notactive {
  height: 0px;
}
.sourceitem-layout {
  display: grid;
  grid-template-rows: auto auto 1fr;
  grid-template-columns: auto 1fr;
  width: 100%;
  height: auto;
  grid-gap: var(--space-sm);
  position: relative;
}
.sourceitem-layout-title {
  grid-row: 1;
  grid-column: 2;
  word-break: break-word;
  overflow-wrap: break-word;
}
.sourceitem-layout-thumbnail {
  grid-row: 1 / 3;
  grid-column: 1;
}
.sourceitem-thumbnail {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  height: 100%;
  width: min(7em, 20vw);
}
.sourceitem-layout-content {
  grid-row: 3;
  grid-column: 1 / 3;
  overflow: hidden;
}
.sourceitem-content-frame {
  width: 100%;
  border: none;
  display: block;
}
.sourceitem-layout-meta {
  grid-row: 2;
  grid-column: 2 / 3;
  font-size: var(--font-xs);
  text-align: left;
}
.sourceitem-date {
  font-size: var(--font-xs);
  padding-right: var(--space-md);
}
.sourceitem-read,
.sourceitem-date,
.sourceitem-layout-meta {
  opacity: 0.5;
}
.source-action {
  font-size: 1.4em;
}

.sourceitem-actions-overlay {
  display: flex;
  position: absolute;
  right: var(--space-sm);
  bottom: var(--space-sm);
  z-index: 2;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: var(--radius-full);
  border: 1px solid color-mix(in srgb, var(--color-border) 35%, transparent);
  background: color-mix(in srgb, var(--color-bg) 30%, transparent);
  backdrop-filter: blur(2px);
}
.sourceitem-overlay-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--color-text);
  padding: 0;
  margin: 0;
  cursor: pointer;
  border-radius: var(--radius-full);
  opacity: 0.75;
}
.sourceitem-overlay-btn .source-action {
  font-size: 1em;
}
.sourceitem-overlay-btn.podcast-play-icon {
  color: var(--color-primary);
}
.sourceitem-overlay-btn:active {
  background: var(--color-bg-hover);
  opacity: 1;
}
/* Pico draws its ring on :focus (not :focus-visible), which leaves it stuck after a tap/click */
.sourceitem-overlay-btn:focus {
  --pico-box-shadow: none;
}
.sourceitem-overlay-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

@media (max-width: 700px) {
  .sourceitem-layout {
    grid-template-columns: 4em 1fr;
    grid-gap: var(--space-xs) var(--space-sm);
    padding: var(--space-sm) 0;
  }
  .sourceitem-layout-thumbnail {
    grid-row: 1;
    align-self: start;
  }
  .sourceitem-thumbnail {
    width: 4em;
    height: 4em;
    border-radius: var(--radius-md);
  }
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
