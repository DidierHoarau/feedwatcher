<template>
  <div>
    <h1>Update Source: {{ source.info.url }}</h1>
    <label>Name</label>
    <input v-model="source.name" type="text" />
    <label>Labels</label>
    <div class="label-list">
      <kbd v-for="(label, index) of labels" :key="index">
        {{ label.name }}<i class="bi bi-x" v-on:click="removeLabel(label)"></i>
      </kbd>
      <i class="bi bi-plus-square" v-on:click="addLabel()"></i>
    </div>
    <button v-on:click="updateSource()">Update</button>
    <button v-on:click="deleteSource()">Delete</button>
    <LabelSelectDialog @onLabelSelected="onLabelSelected" v-if="isSelectLabel" />
  </div>
</template>

<script>
import * as _ from "lodash";
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  data() {
    return {
      source: { info: {} },
      labels: [],
      isSelectLabel: false,
    };
  },
  async created() {
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}`,
        await AuthService.getAuthHeader()
      )
      .then((res) => {
        this.source = res.data;
      })
      .catch(handleError);
    axios
      .get(
        `${(await Config.get()).SERVER_URL}/sources/${this.$route.params.sourceId}/labels`,
        await AuthService.getAuthHeader()
      )
      .then((res) => {
        this.labels = res.data.labels;
      })
      .catch(handleError);
  },
  methods: {
    async updateSource() {
      const labels = [];
      for (const label of this.labels) {
        labels.push(label.name);
      }
      this.source.labels = labels;
      if (this.source.name) {
        await axios
          .put(
            `${(await Config.get()).SERVER_URL}/sources/${this.source.id}`,
            this.source,
            await AuthService.getAuthHeader()
          )
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              type: "info",
              text: "Source updated",
            });
            return SourcesStore().fetch();
          })
          .then(() => {
            SourcesStore().selectSource(this.source.id);
            setTimeout(() => {
              UserProcessorInfoStore().check();
              useRouter().push({ path: "/sources" });
            }, 100);
            UserProcessorInfoStore().check();
            useRouter().push({ path: "/sources" });
          })
          .catch(handleError);
      } else {
        EventBus.emit(EventTypes.ALERT_MESSAGE, {
          type: "error",
          text: "Name missing",
        });
      }
    },
    async deleteSource() {
      if (confirm("Delete the source?") == true) {
        await axios
          .delete(`${(await Config.get()).SERVER_URL}/sources/${this.source.id}`, await AuthService.getAuthHeader())
          .then((res) => {
            EventBus.emit(EventTypes.ALERT_MESSAGE, {
              text: "Source deleted",
            });
            SourcesStore().selectSource("");
            SourcesStore().selectedIndex = 0;
            useRouter().push({ path: "/sources" });
          })
          .catch(handleError);
      }
    },
    async onLabelSelected(label) {
      this.isSelectLabel = false;
      if (!_.find(this.labels, { name: label.name })) {
        this.labels.push({ name: label.label });
      }
    },
    async removeLabel(label) {
      this.labels.splice(_.findIndex(this.labels, { name: label.name }), 1);
    },
    addLabel() {
      this.isSelectLabel = true;
    },
  },
};
</script>

<style scoped>
h1 {
  word-break: break-all;
}
kbd {
  margin-right: 2em;
  margin-bottom: 1em;
}
kbd i {
  margin-left: 0.5em;
}
.label-list {
  margin-bottom: 2em;
}
</style>
