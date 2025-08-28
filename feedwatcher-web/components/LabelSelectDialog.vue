<template>
  <dialog open>
    <article class="label-select-dialog">
      <h3>Select New Label</h3>
      <article class="label-list">
        <div v-for="(source, index) in sourcesStore.sources" v-bind:key="source.name">
          <div
            v-if="source.isLabel && !source.isRoot"
            class="source-name-layout"
            :class="{ 'source-active': sourcesStore.selectedIndex == index }"
          >
            <span class="source-name-indent">
              <span v-html="getIndentation(source)"></span
                console.log(source)>
            </span>
            <div v-on:click="onSourceSelected(source, index)" class="source-name-name">
              <span v-if="!source.isLabel"><i :class="'bi bi-' + source.icon"></i>&nbsp;</span>
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
          <span class="source-name-indent">
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
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      SourcesStore().fetchCounts();
    });
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
      SourcesStore().selectedIndex = SourcesStore().selectedIndex.length - 1;
      this.$emit("onLabelSelected", { label: this.label });
    },
    cancelSelectLabel() {
      this.$emit("onLabelSelectCancel", { });
    },
    getIndentation(source) {
      let indent = "";
      for (let i = 1; i < source.depth; i++) {
        indent += "&nbsp;&nbsp;&nbsp;&nbsp;";
      }
      return indent;
    },
  },
};
</script>

<style scoped>

:root[data-theme="dark"] .source-active {
  background-color: #333;
}

:root[data-theme="light"] .source-active {
  background-color: #bbb;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.source-name-count {
  grid-column: 3;
}

.label-list {
  max-height: 60vh;
  overflow: auto;
}

.label-select-dialog {
  max-height: 80vh;
  min-width: 25em;
  display: grid;
  grid-template-rows: 2em 1fr auto;
}
</style>
