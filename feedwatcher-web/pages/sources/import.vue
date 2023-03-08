<template>
  <div class="page">
    <h2>Source Import (OPML)</h2>
    <input type="file" id="file" name="file" @change="uploadOpml()" />
    <button v-if="sourcesImports.length > 0" v-on:click="startImport()" :disabled="processing">
      Import Selected <i class="bi bi-hourglass-split blink" v-if="processing"></i>
    </button>
    <div v-for="sourcesImport in sourcesImports" v-bind:key="sourcesImport.source.name" class="source-import">
      <div class="source-import-select">
        <input
          type="checkbox"
          v-model="sourcesImport.checked"
          id="terms"
          name="terms"
          :disabled="processing || sourcesImport.imported"
        />
      </div>
      <div class="source-import-url">{{ sourcesImport.source.info.url }}</div>
      <div class="source-import-name">
        <label>Name</label>
        <input v-model="sourcesImport.source.name" type="text" :disabled="processing || sourcesImport.imported" />
      </div>
      <div class="source-import-labels">
        <label>Labels (coma separated)</label>
        <input v-model="sourcesImport.source.labels" type="text" :disabled="processing || sourcesImport.imported" />
      </div>
      <div class="source-import-status">
        <i v-if="sourcesImport.imported" class="bi bi-check-circle"></i>
        <i v-else-if="processing" class="bi bi-hourglass-split blink"></i>
        <i v-else-if="sourcesImport.importFailed" class="bi bi-exclamation-circle-fill"></i>
      </div>
    </div>
  </div>
</template>

<script setup>
const sourceItemsStore = SourceItemsStore();
const userProcessorInfoStore = UserProcessorInfoStore();
</script>

<script>
import axios from "axios";
import * as _ from "lodash";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";

export default {
  data() {
    return {
      sourcesImports: [],
      processing: false,
    };
  },
  async created() {
    if (!(await AuthenticationStore().ensureAuthenticated())) {
      useRouter().push({ path: "/users" });
    }
    EventBus.on(EventTypes.ITEMS_UPDATED, (message) => {
      if (SourceItemsStore().sourceItems.length === 0 && UserProcessorInfoStore().status === "idle") {
        SourceItemsStore().fetch();
      }
    });
  },
  methods: {
    async uploadOpml(event) {
      const formData = new FormData();
      const opmlFile = document.querySelector("#file");
      formData.append("image", opmlFile.files[0]);
      const headers = await AuthService.getAuthHeader();
      headers["Content-Type"] = "multipart/form-data";
      axios
        .post(`${(await Config.get()).SERVER_URL}/sources/import/analyze/opml`, formData, headers)
        .then(async (res) => {
          const sourcesExisting = (
            await axios.get(`${(await Config.get()).SERVER_URL}/sources`, await AuthService.getAuthHeader())
          ).data.sources;
          const sourcesImportTmp = [];
          for (const source of res.data.sources) {
            let labels = "";
            for (const label of source.labels) {
              if (labels) {
                labels += ", ";
              }
              labels += label;
            }
            source.labels = labels;
            let imported = false;
            if (_.find(sourcesExisting, { info: { url: source.info.url } })) {
              imported = true;
            }
            sourcesImportTmp.push({
              source,
              checked: true,
              processing: true,
              imported,
            });
          }
          this.sourcesImports = sourcesImportTmp;
        })
        .catch(handleError);
    },
    async startImport() {
      this.processing = true;
      let importSummary = {
        success: 0,
        error: 0,
        skipped: 0,
      };
      const processingPromises = [];
      for (const sourcesImport of this.sourcesImports) {
        if (sourcesImport.imported) {
          importSummary.skipped++;
        } else {
          processingPromises.push(async () => {
            try {
              let res = await axios.post(
                `${(await Config.get()).SERVER_URL}/sources`,
                { url: sourcesImport.source.info.url },
                await AuthService.getAuthHeader()
              );
              const source = res.data;
              const labelsStr = sourcesImport.source.labels
                .replace(/ +(?= )/g, "")
                .replace(/\/ /g, "/")
                .replace(/ \//g, "/")
                .replace(/\/+/g, "/");
              const sourceLabels = [];
              for (const label of labelsStr.split(",")) {
                if (label.trim()) {
                  sourceLabels.push(label.trim());
                }
              }
              source.labels = sourceLabels;
              if (sourcesImport.source.name) {
                source.name = sourcesImport.source.name;
              }
              await axios.put(
                `${(await Config.get()).SERVER_URL}/sources/${source.id}`,
                source,
                await AuthService.getAuthHeader()
              );
              sourcesImport.imported = true;
              sourcesImport.importFailed = false;
              importSummary.success++;
            } catch (err) {
              console.error(err);
              importSummary.error++;
              sourcesImport.importFailed = true;
            }
          });
        }
      }
      while (processingPromises.length) {
        await Promise.all(processingPromises.splice(0, 3).map((f) => f())).catch(handleError);
      }
      this.processing = false;
      EventBus.emit(EventTypes.ALERT_MESSAGE, {
        text: `Imported: ${importSummary.success} ; Failed: ${importSummary.error} ; Skipped: ${importSummary.skipped}`,
      });
      await SourcesStore().fetch();
    },
  },
};
</script>

<style scoped>
.source-import {
  display: grid;
  grid-template-columns: 2em 1fr 2em;
  grid-template-rows: auto auto auto;
  margin: 0.5em 0em;
}
.source-import-check {
  grid-row: 1;
  grid-column: 1;
}
.source-import-name {
  grid-row: 2;
  grid-column: 2;
}
.source-import-url {
  grid-row: 1;
  grid-column: 2;
}
.source-import-labels {
  grid-row: 3;
  grid-column: 2;
}
.source-import-status {
  grid-row: 1;
  grid-column: 3;
  text-align: right;
}
</style>
