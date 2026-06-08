<template>
  <dialog
    class="source-dialog"
    ref="dialogRef"
    v-if="modelValue"
    v-on:click.self="close()"
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
          sandbox="allow-same-origin allow-popups allow-scripts"
          ref="contentFrame"
        ></iframe>
        <iframe
          v-else
          class="source-dialog-frame"
          :srcdoc="iframeSrcdoc"
          sandbox="allow-same-origin allow-popups allow-scripts"
        ></iframe>
      </div>

      <footer>
        <button class="secondary" v-on:click="close()">
          <i class="bi bi-x-lg"></i> Close
        </button>
        <button class="secondary" v-on:click="openExternal()">
          <i class="bi bi-box-arrow-up-right"></i> Open
        </button>
        <button
          v-if="!showFullSource && supportsFullSource"
          class="secondary"
          v-on:click="loadFull()"
        >
          <i class="bi bi-arrow-down-circle"></i> Load Full
        </button>
        <button
          v-if="showFullSource"
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
import { PreferencesService } from "~~/services/PreferencesService";

export default {
  props: {
    modelValue: Boolean,
    item: { type: Object, default: null },
  },
  emits: ["update:modelValue"],
  data() {
    return {
      showFullSource: false,
      supportsFullSource: false,
    };
  },
  computed: {
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
      </style></head><body>${content}</body></html>`;
    },
  },
  watch: {
    modelValue(val) {
      if (val) {
        this.showFullSource =
          PreferencesService.getOpenLinksMode() === "dialog-full";
        this.loadingFull = false;
        this.supportsFullSource = this.item?.url?.startsWith("http");
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
  methods: {
    close() {
      this.$refs.dialogRef?.close();
      this.$emit("update:modelValue", false);
    },
    openExternal() {
      if (this.item?.url) {
        window.open(this.item.url, "_blank");
      }
    },
    loadFull() {
      if (!this.item?.url) return;
      this.showFullSource = true;
    },
    showSummary() {
      this.showFullSource = false;
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
</style>
