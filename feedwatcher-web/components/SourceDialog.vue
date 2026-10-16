<template>
  <dialog
    class="source-dialog"
    ref="dialogRef"
    v-if="modelValue"
    v-on:click.self="close()"
    v-on:close="onNativeClose()"
  >
    <article>
      <header>
        <button aria-label="Close" rel="prev" v-on:click="close()"></button>
        <p class="source-dialog-title">
          {{ item.title }} ({{ item.sourceName }})
        </p>
      </header>
      <div class="source-dialog-body">
        <iframe
          v-if="showFullSource"
          class="source-dialog-frame"
          :src="item.url"
          sandbox="allow-popups allow-scripts"
          ref="contentFrame"
        ></iframe>
        <div
          v-else-if="readerState === 'ready'"
          class="reader-content"
          v-html="sanitizedReaderContent"
        ></div>
        <div v-else-if="readerState === 'loading'" class="reader-state">
          <Loading />
        </div>
        <div v-else-if="readerState === 'error'" class="reader-state">
          <p>Reader view unavailable for this article</p>
          <button
            v-if="item.url"
            class="secondary"
            v-on:click="openExternal()"
          >
            <i class="bi bi-box-arrow-up-right"></i> Open
          </button>
        </div>
        <iframe
          v-else
          class="source-dialog-frame"
          :srcdoc="iframeSrcdoc"
          sandbox="allow-popups allow-scripts"
        ></iframe>
      </div>

      <footer class="source-dialog-footer">
        <button class="secondary" v-on:click="close()">
          <i class="bi bi-x-lg"></i> Close
        </button>
        <button v-if="isPodcastItem" class="primary" v-on:click="playPodcast()">
          <i class="bi bi-play-circle-fill"></i> Play Episode
        </button>
        <button v-if="item.url" class="secondary" v-on:click="openExternal()">
          <i class="bi bi-box-arrow-up-right"></i> Open
        </button>
        <button
          v-if="supportsReader && !showFullSource && !readerActive"
          class="secondary"
          v-on:click="loadReader()"
        >
          <i class="bi bi-file-earmark-text"></i> Reader view
        </button>
        <button
          v-if="!showFullSource && supportsFullSource"
          class="secondary"
          v-on:click="loadFull()"
        >
          <i class="bi bi-arrow-down-circle"></i> Load Full
        </button>
        <button
          v-if="showFullSource || readerActive"
          class="secondary"
          v-on:click="showSummary()"
        >
          <i class="bi bi-file-text"></i> Show Summary
        </button>
      </footer>
    </article>
  </dialog>
</template>

<script>
import axios from "axios";
import DOMPurify from "dompurify";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";

export default {
  props: {
    modelValue: Boolean,
    item: { type: Object, default: null },
    initialFull: { type: Boolean, default: false },
    initialReader: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  data() {
    return {
      showFullSource: false,
      supportsFullSource: false,
      readerState: "idle",
      readerContent: "",
      readerTitle: "",
      readerRequestId: 0,
    };
  },
  computed: {
    supportsReader() {
      return !!this.item?.url?.startsWith("http");
    },
    readerActive() {
      return this.readerState === "loading" || this.readerState === "ready";
    },
    isPodcastItem() {
      return !!(this.item?.info?.isPodcast && this.item?.info?.audioUrl);
    },
    sanitizedReaderContent() {
      return DOMPurify.sanitize(this.readerContent);
    },
    iframeSrcdoc() {
      const isDark = (localStorage.getItem("UI_THEME") || "dark") === "dark";
      const bg = isDark ? "#11191f" : "#ffffff";
      const fg = isDark ? "#c2cfd6" : "#1a1a1a";
      const linkColor = isDark ? "#6ea8fe" : "#1a56db";
      const content = this.item?.content || "";
      return `<!DOCTYPE html><html><head><style>
        body { margin: 0; padding: 1em; font-family: sans-serif; font-size: 16px; word-break: break-word; overflow-wrap: break-word; background-color: ${bg}; color: ${fg}; }
        img { max-width: 100%; height: auto; }
        a { color: ${linkColor}; }
        pre { overflow-x: auto; }
        table { max-width: 100%; overflow-x: auto; display: block; }
        iframe[src*="youtube"] { width: 100%; aspect-ratio: 16/9; height: auto; }
      </style></head><body>${content}</body></html>`;
    },
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.showFullSource = this.initialFull;
        this.supportsFullSource = this.item?.url?.startsWith("http");
        this.resetReader();
        this.markItemAsRead();
        if (this.initialReader && this.supportsReader) {
          this.loadReader();
        }
        this.$nextTick(() => {
          if (this.$refs.dialogRef) {
            this.$refs.dialogRef.showModal();
          }
        });
      }
    },
    item() {
      this.supportsFullSource = this.item?.url?.startsWith("http");
    },
  },
  mounted() {
    document.addEventListener("keydown", this.onKeydown);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
  },
  methods: {
    onKeydown(event) {
      if (!this.modelValue || event.key !== "r") {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (this.readerActive) {
        this.showSummary();
      } else if (this.supportsReader) {
        this.loadReader();
      }
    },
    resetReader() {
      this.readerRequestId += 1;
      this.readerState = "idle";
      this.readerContent = "";
      this.readerTitle = "";
    },
    async loadReader() {
      if (!this.item?.url) return;
      this.showFullSource = false;
      this.readerState = "loading";
      const requestId = ++this.readerRequestId;
      try {
        const res = await axios.post(
          `${(await Config.get()).SERVER_URL}/items/fetch-url`,
          { url: this.item.url },
          await AuthService.getAuthHeader(),
        );
        if (requestId !== this.readerRequestId) {
          return;
        }
        this.readerTitle = res.data.title || this.item.title || "";
        this.readerContent = res.data.content || "";
        this.readerState = this.readerContent ? "ready" : "error";
      } catch (error) {
        if (requestId !== this.readerRequestId) {
          return;
        }
        this.readerState = "error";
        if (error?.response?.status !== 422) {
          handleError(error);
        }
      }
    },
    close() {
      this.$refs.dialogRef?.close();
      this.$emit("update:modelValue", false);
    },
    onNativeClose() {
      this.$emit("update:modelValue", false);
    },
    async markItemAsRead() {
      if (!this.item || this.item.status === "read") {
        return;
      }
      axios
        .put(
          `${(await Config.get()).SERVER_URL}/items/status`,
          { status: "read", itemIds: [this.item.id] },
          await AuthService.getAuthHeader(),
        )
        .then((res) => {
          this.item.status = "read";
          EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        })
        .catch(handleError);
    },
    openExternal() {
      if (this.item?.url) {
        this.markItemAsRead();
        window.open(this.item.url, "_blank");
      }
    },
    playPodcast() {
      if (!this.item?.info?.audioUrl) return;
      const store = PodcastPlayerStore();
      store.play(this.item);
      this.close();
      useRouter().push({ path: "/podcast", query: { itemId: this.item.id } });
    },
    loadFull() {
      if (!this.item?.url) return;
      this.showFullSource = true;
    },
    showSummary() {
      this.showFullSource = false;
      this.resetReader();
    },
  },
};
</script>

<style scoped>
/* Let Pico handle the dialog overlay, just prevent scrollbars, fix height and remove padding */
dialog {
  padding: 0;
  align-items: stretch;
  overflow: hidden;
  height: 100dvh;
  width: 100dvw;
}

.source-dialog article {
  height: 100%;
  width: 100vw;
  max-width: 100dvw;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.source-dialog-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.source-dialog-body {
  position: relative;
  overflow: auto;
  min-height: 0;
}

.source-dialog-frame {
  width: 100%;
  height: 100%;
  min-height: 100%;
  border: none;
  display: block;
}

.reader-content {
  max-width: 46em;
  margin: 0 auto;
  padding: var(--space-lg, 1.5em) var(--space-md, 1em);
  line-height: 1.7;
  overflow-wrap: break-word;
}

.reader-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.reader-content :deep(a) {
  color: var(--color-primary);
}

.reader-content :deep(pre) {
  overflow-x: auto;
}

.reader-content :deep(table) {
  max-width: 100%;
  overflow-x: auto;
  display: block;
}

.reader-content :deep(blockquote) {
  border-left: 3px solid var(--color-border);
  margin-left: 0;
  padding-left: var(--space-md, 1em);
  color: var(--color-text-secondary, inherit);
}

.reader-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--space-md, 1em);
  height: 100%;
  text-align: center;
}

.reader-state button {
  width: auto;
}

/* Replace Pico's right-aligned inline flow (buttons wrap ragged on small
   screens) with an even flex row; buttons stack full-width on mobile. */
.source-dialog-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: calc(var(--pico-spacing) * 0.5);
}

.source-dialog-footer button {
  width: auto;
  margin: 0;
}

@media (max-width: 700px) {
  .source-dialog-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
