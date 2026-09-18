<template>
  <SourceItemsLayout
    title="Sources"
    display-count="unreadCount"
    show-add-source
    @onSourceSelected="onSourceSelected"
    @onLabelSelected="onLabelSelected"
    @onRootSelected="onRootSelected"
  >
    <SourceItemsActionsRow
      v-model:filter-status="filterStatus"
      filter-placeholder="Filter items…"
    />
    <div id="sources-items-list-page">
      <div
        class="item-list-card"
        v-for="sourceItem in sourceItemsStore.sourceItems"
        v-bind:key="sourceItem.id"
      >
        <LazySourceItem
          class="fade-in-fast item-list-card"
          :item="sourceItem"
        />
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
  </SourceItemsLayout>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const filterStatus = ref("unread");
const { onSourceSelected, onLabelSelected, onRootSelected } =
  useSourceItemsPage({
    filterStatus,
    filterSaved: false,
    syncSourcesStore: true,
    syncRoute: true,
    routeQueryInit: true,
  });
useSourceItemsInfiniteScroll();
</script>

<style scoped>
#sources-items-list-page {
  grid-row: 4;
  grid-column: 1 / 3;
  display: flex;
  align-items: flex-start;
  align-content: flex-start;
  flex-wrap: wrap;
  gap: var(--space-md);
}

@media (min-width: 701px) {
  #sources-items-list-page {
    grid-row: 3;
    grid-column-start: 2;
    grid-column-end: span 2;
    overflow: auto;
  }
}

#sources-items-list-page-next {
  width: 100%;
}
</style>
