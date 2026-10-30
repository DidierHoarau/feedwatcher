<template>
  <dialog open>
    <article class="label-select-dialog">
      <h3>Select New Label</h3>
      <article class="label-list">
        <div
          v-for="entry in labelEntries"
          v-bind:key="entry.row.labelName"
        >
          <SourceTreeRow
            :row="entry.row"
            :collapsible="false"
            :active="sourcesStore.selectedIndex === entry.index"
            v-on:select="onSourceSelected(entry.row, entry.index)"
          />
        </div>
        <SourceTreeRow
          v-if="displaySaved"
          :row="savedRow"
          :collapsible="false"
          :active="sourcesStore.selectedIndex == -2"
          v-on:select="onSavedSelected()"
        />
      </article>
      <label>Label Name</label>
      <input v-model="label" type="text" />
      <button v-on:click="selectLabel()">Select</button><br/>
      <button v-on:click="cancelSelectLabel()">Cancel</button>
    </article>
  </dialog>
</template>

<script setup>
import SourceTreeRow from "~~/components/SourceTreeRow.vue";

const sourcesStore = SourcesStore();

const labelEntries = computed(() =>
  sourcesStore.sources
    .map((row, index) => ({ row, index }))
    .filter((entry) => entry.row.isLabel && !entry.row.isRoot),
);

const savedRow = {
  isLabel: false,
  isRoot: false,
  depth: 1,
  hasChildren: false,
  labelName: "",
  displayName: "Saved Items",
  name: "Saved Items",
  icon: "bookmark-plus-fill",
  sourceInfo: {},
  unreadCount: 0,
  savedCount: 0,
  isCollapsed: false,
  isVisible: true,
};
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
