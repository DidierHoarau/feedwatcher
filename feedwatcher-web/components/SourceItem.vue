<template>
  <article class="sourceitom-layout">
    <div class="sourceitom-layout-date" v-on:click="clickedItem()">{{ $dayjs(item.datePublished).fromNow() }}</div>
    <div class="sourceitom-layout-title" v-on:click="clickedItem()">{{ item.title }}</div>
    <div class="sourceitom-layout-link">
      <a :href="item.url" target="_blank"><i class="bi bi-link"></i></a>
    </div>
    <div :class="{ 'source-active': isActive, 'source-notactive': !isActive }" class="sourceitom-layout-content">
      <span v-html="item.content"></span>
    </div>
  </article>
</template>

<script>
export default {
  props: {
    item: {},
  },
  data() {
    return {
      isActive: false,
    };
  },
  methods: {
    clickedItem() {
      this.isActive = !this.isActive;
    },
  },
};
</script>

<style scoped>
.source-active {
  height: auto;
  padding-bottom: 1em;
  border-top: 2px solid #333;
  padding-top: 1em;
  margin-top: 1em;
}
.source-notactive {
  height: 0px;
}
.sourceitom-layout {
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: auto 1fr auto;
  height: calc(100vh - 5em);
  width: 100%;
  height: auto;
  grid-gap: 0.5em;
  padding: 0.5em;
  margin: 0.5em 0;
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
  overflow: hidden;
}
</style>
