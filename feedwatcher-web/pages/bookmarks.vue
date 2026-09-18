<template>
  <SourceItemsLayout
    title="Bookmarks"
    display-count="savedCount"
    lazy-tree
    @onSourceSelected="onSourceSelected"
    @onLabelSelected="onLabelSelected"
    @onRootSelected="onRootSelected"
  >
    <SourceItemsActionsRow
      v-model:filter-status="filterStatus"
      filter-placeholder="Filter bookmarks…"
    />
    <div id="sources-items-list">
      <div id="sources-items-list-page">
        <div
          v-for="sourceItem in sourceItemsStore.sourceItems"
          v-bind:key="sourceItem.id"
        >
          <LazySourceItem class="fade-in-fast" :item="sourceItem" />
        </div>
        <div id="sources-items-list-page-next">
          <Loading v-if="sourceItemsStore.loading" />
          <span
            v-if="
              sourceItemsStore.sourceItems.length == 0 &&
              !sourceItemsStore.loading
            "
            >No items</span
          >
        </div>
      </div>
    </div>
  </SourceItemsLayout>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const filterStatus = ref("all");
const { onSourceSelected, onLabelSelected, onRootSelected } =
  useSourceItemsPage({
    filterStatus,
    filterSaved: true,
  });
useSourceItemsInfiniteScroll();
</script>

<style scoped>
@media (max-width: 700px) {
  #sources-items-list {
    overflow: scroll;
    grid-row: 4;
    grid-column-start: 1;
    grid-column-end: span 2;
  }
}

@media (min-width: 701px) {
  #sources-items-list {
    overflow: auto;
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
  }
}
</style>
