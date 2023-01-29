<template>
  <div class="sourceitom-layout">
    <div class="sourceitom-layout-date">{{ $dayjs(item.datePublished).fromNow() }}</div>
    <div class="sourceitom-layout-title">{{ item.title }}</div>
    <div class="sourceitom-layout-link"><a :href="item.url">GO</a></div>
    <div class="sourceitom-layout-content">
      {{ item.content }}
    </div>
  </div>
</template>

<script>
export default {
  props: {
    item: {},
  },
  methods: {},
};
</script>

<style scoped>
.sourceitom-layout {
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: auto 1fr auto;
  height: calc(100vh - 5em);
  width: 100%;
  height: auto;
  grid-gap: 0.5em;
}
.sourceitom-layout-date {
  grid-row: 1;
  grid-column: 1;
}
.sourceitom-layout-title {
  grid-row: 1;
  grid-column: 2;
}
.sourceitom-layout-link {
  grid-row: 1;
  grid-column: 3;
}
.sourceitom-layout-content {
  grid-row: 2;
  grid-column-start: 1;
  grid-column-end: span 3;
}
</style>
