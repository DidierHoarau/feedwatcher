import { AuthService } from "~~/services/AuthService";

export const AuthenticationState = defineStore("AuthenticationState", {
  state: () => ({
    isAuthenticated: false,
  }),

  getters: {},

  actions: {
    async ensureAuthenticated(): Promise<boolean> {
      this.isAuthenticated = await AuthService.isAuthenticated();
      return this.isAuthenticated;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(AuthenticationState, import.meta.hot));
}
