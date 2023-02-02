<template>
  <article class="sourceitom-layout">
    <div class="sourceitom-layout-date" v-on:click="clickedItem()">{{ relativeTime(item.datePublished) }}</div>
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
    relativeTime(date) {
      const delta = Math.round((new Date() - new Date(date)) / 1000);
      const minute = 60,
        hour = minute * 60,
        day = hour * 24,
        week = day * 7,
        month = day * 30,
        year = day * 365;
      if (delta < 60) {
        return "just now";
      } else if (delta < hour) {
        return Math.floor(delta / minute) + " minutes ago";
      } else if (delta < 2 * hour) {
        return "1 hour ago";
      } else if (delta < day) {
        return Math.floor(delta / hour) + " hours ago";
      } else if (delta < 2 * day) {
        return "1 day ago";
      } else if (delta < week) {
        return Math.floor(delta / day) + " days ago";
      } else if (delta < 2 * week) {
        return "1 week ago";
      } else if (delta < month) {
        return Math.floor(delta / week) + " weeks ago";
      } else if (delta < 2 * month) {
        return "1 month ago";
      } else if (delta < year) {
        return Math.floor(delta / month) + " months ago";
      } else if (delta < 2 * year) {
        return "1 year ago";
      } else {
        return Math.floor(delta / year) + " years ago";
      }
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
  font-size: 70%;
  padding-top: 0.4em;
  color: #666;
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
