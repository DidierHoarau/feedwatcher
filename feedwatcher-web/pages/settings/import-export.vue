<template>
  <div class="settings-tab-content">
    <article class="settings-card">
      <header>
        <h4><i class="bi bi-diagram-3"></i> Import / Export Sources</h4>
      </header>
      <div class="settings-card-actions">
        <button @click="gotoImport()">
          <i class="bi bi-upload"></i> Import OPML
        </button>
        <button @click="downloadExport('/sources/import/export/opml', 'opml')">
          <i class="bi bi-download"></i> Export OPML
        </button>
        <button @click="downloadExport('/sources/import/export/json', 'json')">
          <i class="bi bi-download"></i> Export JSON (sources)
        </button>
        <button
          @click="
            downloadExport(
              '/sources/import/export/json?includeItems=true',
              'json',
            )
          "
        >
          <i class="bi bi-download"></i> Export JSON (sources + items)
        </button>
      </div>
    </article>
  </div>
</template>

<script>
import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";
import { handleError } from "~~/services/EventBus";

export default {
  methods: {
    gotoImport() {
      useRouter().push({ path: "/sources/import" });
    },
    async downloadExport(path, extension) {
      const headers = await AuthService.getAuthHeader();
      headers.responseType = "blob";
      axios
        .get(`${(await Config.get()).SERVER_URL}${path}`, headers)
        .then((response) => {
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute(
            "download",
            `sources_export_${new Date().toISOString()}.${extension}`,
          );
          document.body.appendChild(link);
          link.click();
        })
        .catch(handleError);
    },
  },
};
</script>
