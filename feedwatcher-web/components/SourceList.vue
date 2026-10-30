<template>
  <div class="source-list-container">
    <div class="source-list-filter">
      <input
        v-model="filterText"
        class="source-filter-input"
        type="search"
        placeholder="Filter sources..."
      />
    </div>
    <div class="source-list-scroll">
      <div v-for="entry in visibleRows" v-bind:key="entry.index" :ref="'source-' + entry.index">
        <SourceTreeRow
          :row="entry.row"
          :display-count="displayCount"
          :active="sourcesStore.selectedIndex === entry.index"
          v-on:select="onSourceSelected(entry.row, entry.index)"
          v-on:toggle="toggleLabelCollapsed(entry.index)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { filterTreeIndices } from "~~/services/SourceTree";
import SourceTreeRow from "~~/components/SourceTreeRow.vue";

const sourcesStore = SourcesStore();
const filterText = ref("");

const visibleRows = computed(() =>
  filterTreeIndices(sourcesStore.sources, filterText.value).map((index) => ({
    index,
    row: sourcesStore.sources[index],
  })),
);
</script>

<script>
import { EventBus, EventTypes } from "~~/services/EventBus";

export default {
  props: {
    displayCount: false,
  },
  data() {
    return {
      knownSelectedIndex: -1,
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
    watch(
      () => SourcesStore().selectedIndex,
      () => {
        this.scrollToSelectedIndex();
      },
    );
    this.scrollToSelectedIndex();
  },
  methods: {
    onSourceSelected(source, index) {
      this.knownSelectedIndex = index;
      SourcesStore().selectedIndex = index;
      if (source.isRoot) {
        this.$emit("onRootSelected", {});
      } else if (source.isLabel) {
        this.$emit("onLabelSelected", source);
      } else {
        this.$emit("onSourceSelected", source);
      }
    },
    toggleLabelCollapsed(index) {
      SourcesStore().toggleLabelCollapsed(index);
    },
    scrollToSelectedIndex() {
      if (this.knownSelectedIndex === SourcesStore().selectedIndex) {
        return;
      }
      setTimeout(() => {
        const element = this.$refs["source-" + SourcesStore().selectedIndex];
        if (element && element[0]) {
          element[0].scrollIntoView({
            behavior: "smooth",
          });
        }
      }, 500);
    },
  },
};
</script>

<style scoped>
.source-list-container {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  min-height: 0;
}

.source-list-filter {
  grid-row: 1;
  padding: var(--space-xs) var(--space-sm);
}

.source-list-scroll {
  grid-row: 2;
  overflow-y: auto;
  min-height: 0;
}

.source-filter-input {
  width: 100%;
  align-self: stretch;
  font-size: var(--font-sm);
  padding-top: 0;
  padding-bottom: 0;
  height: 2.4rem;
  margin-bottom: 0;
  border-radius: var(--radius-md);
}
</style>
