<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="item-actions-sheet-backdrop"
      v-on:click="$emit('close')"
    ></div>
    <div
      v-if="open"
      ref="sheet"
      class="item-actions-sheet"
      role="menu"
      aria-label="Item actions"
      @keydown="onKeydown"
    >
      <div class="item-actions-sheet-handle"></div>
      <p class="item-actions-sheet-title">
        {{ item.sourceName }} · {{ item.title }}
      </p>

      <div
        class="item-actions-sheet-item"
        role="menuitem"
        tabindex="-1"
        v-on:click="select('toggle-read')"
      >
        <i :class="isRead ? 'bi bi-envelope' : 'bi bi-envelope-open'"></i>
        {{ isRead ? "Mark as unread" : "Mark as read" }}
      </div>

      <div
        class="item-actions-sheet-item"
        role="menuitem"
        tabindex="-1"
        v-on:click="select('toggle-save')"
      >
        <i
          :class="isSaved ? 'bi bi-bookmark-dash-fill' : 'bi bi-bookmark-plus'"
        ></i>
        {{ isSaved ? "Remove bookmark" : "Save bookmark" }}
        <span class="hint">{{ isSaved ? "saved" : "not saved" }}</span>
      </div>

      <div
        class="item-actions-sheet-item"
        role="menuitem"
        tabindex="-1"
        v-on:click="select('open-link')"
      >
        <i class="bi bi-box-arrow-up-right"></i>
        Open link
      </div>
    </div>
  </Teleport>
</template>

<script>
export default {
  name: "ItemActionsSheet",
  props: {
    open: { type: Boolean, default: false },
    item: { type: Object, required: true },
    isSaved: { type: Boolean, default: false },
  },
  emits: ["close", "toggle-read", "toggle-save", "open-link"],
  computed: {
    isRead() {
      return this.item.status === "read";
    },
  },
  watch: {
    open(isOpen) {
      if (isOpen) {
        this.$nextTick(() => {
          const first = this.$refs.sheet?.querySelector(
            ".item-actions-sheet-item",
          );
          if (first) {
            first.focus();
          }
        });
      }
    },
  },
  methods: {
    select(action) {
      this.$emit(action);
      this.$emit("close");
    },
    onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.$emit("close");
        return;
      }
      if (event.key === "Tab" || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = Array.from(
          this.$refs.sheet.querySelectorAll(".item-actions-sheet-item"),
        );
        if (items.length === 0) {
          return;
        }
        const currentIndex = items.indexOf(document.activeElement);
        let nextIndex;
        if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
          nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
        } else {
          nextIndex =
            currentIndex === -1 || currentIndex === items.length - 1
              ? 0
              : currentIndex + 1;
        }
        items[nextIndex].focus();
      }
    },
  },
};
</script>
