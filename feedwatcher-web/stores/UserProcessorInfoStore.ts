import { Timeout } from "~~/services/Timeout";
import { AuthService } from "~~/services/AuthService";
import Config from "~~/services/Config";
import { handleError, EventBus, EventTypes } from "~~/services/EventBus";
import axios from "axios";

export const UserProcessorInfoStore = defineStore("UserProcessorInfoStore", {
  state: () => ({
    lastUpdate: new Date(),
    status: "idle",
    checkFrequency: 10 * 1000,
    checking: false,
  }),

  getters: {},

  actions: {
    async check() {
      if (this.checking) {
        return;
      }
      this.checking = true;
      if (!(await AuthService.getAuthHeader())) {
        this.checkFrequency = 10 * 1000;
      } else {
        try {
          const info = (
            await axios.get(`${(await Config.get()).SERVER_URL}/processors/status`, await AuthService.getAuthHeader())
          ).data;
          if (info.status !== "idle" || this.lastUpdate < new Date(info.lastUpdate)) {
            this.checkFrequency = 2000;
            EventBus.emit(EventTypes.SOURCES_UPDATED, {});
            EventBus.emit(EventTypes.ITEMS_UPDATED, {});
          } else {
            this.checkFrequency = Math.min(this.checkFrequency * 2, 5 * 60 * 1000);
          }
          this.status = info.status;
          this.lastUpdate = new Date(info.lastUpdate);
        } catch (err) {
          console.error(err);
        }
      }
      this.checking = false;
      Timeout.wait(this.checkFrequency).then(() => {
        this.check();
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(UserProcessorInfoStore, import.meta.hot));
}
