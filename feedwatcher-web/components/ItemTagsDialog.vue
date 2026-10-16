<template>
  <Teleport to="body">
    <div v-if="visible" class="item-tags-backdrop" v-on:click="close()">
      <div
        class="item-tags-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Edit item tags"
        v-on:click.stop
      >
        <h2>Tags</h2>
        <p v-if="item" class="item-tags-item-title">{{ item.title }}</p>
        <div v-if="tags.length > 0" class="item-tags-chips">
          <span v-for="(tag, index) in tags" :key="tag" class="item-tag-chip">
            {{ tag }}
            <button
              type="button"
              class="item-tag-remove"
              :aria-label="'Remove tag ' + tag"
              v-on:click="removeTag(index)"
            >
              <i class="bi bi-x"></i>
            </button>
          </span>
        </div>
        <p v-else class="item-tags-empty">No tags yet</p>
        <form class="item-tags-add" v-on:submit.prevent="addTag()">
          <input
            v-model="newTag"
            list="item-tags-options"
            type="text"
            placeholder="Add a tag…"
            aria-label="Add a tag"
            maxlength="200"
          />
          <datalist id="item-tags-options">
            <option v-for="tag in availableTags" :key="tag" :value="tag"></option>
          </datalist>
          <button type="submit" class="secondary">Add</button>
        </form>
        <footer class="item-tags-footer">
          <button class="secondary" v-on:click="close()">Cancel</button>
          <button v-on:click="save()">Save</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script>
import axios from "axios";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";

export default {
  data() {
    return {
      visible: false,
      item: null,
      tags: [],
      newTag: "",
      availableTags: [],
    };
  },
  mounted() {
    document.addEventListener("keydown", this.onKeydown);
    this.onOpen = (payload) => {
      this.item = payload.item;
      this.tags = [...(payload.item?.tags || [])];
      this.newTag = "";
      this.visible = true;
      this.fetchAvailableTags();
    };
    EventBus.on(EventTypes.OPEN_ITEM_TAGS, this.onOpen);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
    EventBus.off(EventTypes.OPEN_ITEM_TAGS, this.onOpen);
  },
  methods: {
    onKeydown(event) {
      if (this.visible && event.key === "Escape") {
        event.stopPropagation();
        this.close();
      }
    },
    async fetchAvailableTags() {
      try {
        const res = await axios.get(
          `${(await Config.get()).SERVER_URL}/items/tags`,
          await AuthService.getAuthHeader(),
        );
        this.availableTags = res.data.tags || [];
      } catch (error) {
        console.error("Failed to fetch tags", error);
      }
    },
    addTag() {
      const value = this.newTag.trim().slice(0, 200);
      if (!value) {
        return;
      }
      if (!this.tags.includes(value)) {
        this.tags.push(value);
      }
      this.newTag = "";
    },
    removeTag(index) {
      this.tags.splice(index, 1);
    },
    async save() {
      if (this.newTag.trim()) {
        this.addTag();
      }
      try {
        const res = await axios.put(
          `${(await Config.get()).SERVER_URL}/items/${this.item.id}/tags`,
          { tags: this.tags },
          await AuthService.getAuthHeader(),
        );
        this.item.tags = res.data.tags || [];
        EventBus.emit(EventTypes.ITEMS_UPDATED, {});
        this.close();
      } catch (error) {
        handleError(error);
      }
    },
    close() {
      this.visible = false;
    },
  },
};
</script>

<style scoped>
.item-tags-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--color-shadow-lg, rgba(0, 0, 0, 0.5)) 60%, transparent);
  padding: var(--space-md, 1em);
}

.item-tags-panel {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 8px);
  box-shadow: 0 8px 24px var(--color-shadow-lg, rgba(0, 0, 0, 0.5));
  padding: var(--space-lg, 1.5em);
  width: min(28rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  overflow: auto;
}

.item-tags-panel h2 {
  font-size: var(--font-lg, 1.2em);
  margin-top: 0;
}

.item-tags-item-title {
  font-size: var(--font-sm);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: var(--space-md, 1em);
}

.item-tags-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs, 0.35rem);
  margin-bottom: var(--space-md, 1em);
}

.item-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full, 999px);
  padding: 0.1rem 0.3rem 0.1rem 0.6rem;
  font-size: var(--font-sm, 0.85em);
}

.item-tag-remove {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.item-tag-remove:hover,
.item-tag-remove:focus {
  color: var(--color-text);
  background: transparent;
}

.item-tags-empty {
  opacity: 0.6;
  margin-bottom: var(--space-md, 1em);
}

.item-tags-add {
  display: flex;
  gap: var(--space-sm, 0.5em);
  align-items: center;
}

.item-tags-add input {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.item-tags-add button,
.item-tags-footer button {
  width: auto;
  margin: 0;
  white-space: nowrap;
}

.item-tags-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm, 0.5em);
  margin-top: var(--space-md, 1em);
}
</style>
