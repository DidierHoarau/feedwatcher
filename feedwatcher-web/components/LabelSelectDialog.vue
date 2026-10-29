<template>
  <dialog open>
    <article class="label-select-dialog">
      <h3>Select New Label</h3>
      <article class="label-list">
        <div
          v-for="(source, index) in sourcesStore.sources"
          v-bind:key="(source.sourceId || source.labelName) + '-' + index"
        >
          <div
            v-if="source.isLabel && !source.isRoot"
            class="source-name-layout"
            :class="{ 'source-active': sourcesStore.selectedIndex == index }"
            :style="{ '--tree-indent': Math.max(source.depth - 1, 0) }"
          >
            <span class="source-name-toggle"></span>
            <span class="source-name-icon">
              <i
                :class="
                  source.isCollapsed ? 'bi bi-folder-fill' : 'bi bi-folder2-open'
                "
              ></i>
            </span>
            <div v-on:click="onSourceSelected(source, index)" class="source-name-name">
              {{ source.displayName }}
            </div>
          </div>
        </div>
        <div
          v-if="displaySaved"
          v-on:click="onSavedSelected()"
          class="source-name-layout"
          :class="{ 'source-active': sourcesStore.selectedIndex == -2 }"
        >
          <span class="source-name-toggle"></span>
          <span class="source-name-icon">
            <i class="bi bi-bookmark-plus-fill"></i>
          </span>
          <div class="source-name-name">Saved Items</div>
        </div>
      </article>
      <label>Label Name</label>
      <input v-model="label" type="text" />
      <button v-on:click="selectLabel()">Select</button><br/>
      <button v-on:click="cancelSelectLabel()">Cancel</button>
    </article>
  </dialog>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const sourcesStore = SourcesStore();
</script>

<script>
import * as _ from "lodash";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  props: {
    displayCount: false,
    displaySaved: false,
  },
  data() {
    return {
      label: "",
    };
  },

  async created() {
    if (!SourceItemsStore().selectedSource) {
      SourcesStore().selectedIndex = 0;
    }
    SourcesStore().fetch();
    EventBus.on(EventTypes.SOURCES_UPDATED, (message) => {
      SourcesStore().fetch();
    });
  },
  methods: {
    onSourceSelected(source, index) {
      this.label = source.labelName;
      SourcesStore().selectedIndex = index;
    },
    selectLabel() {
      this.$emit("onLabelSelected", { label: this.label });
    },
    cancelSelectLabel() {
      this.$emit("onLabelSelectCancel", { });
    },
  },
};
</script>

<style scoped>
.label-list {
  max-height: 60vh;
  overflow: auto;
}

.label-select-dialog {
  max-height: 80vh;
  /* Never wider than the viewport: on phones the fixed 25em used to overflow. */
  min-width: min(25em, 100%);
  display: grid;
  grid-template-rows: 2em 1fr auto;
}
</style>
