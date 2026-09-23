export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") {
    if (await AuthenticationStore().ensureAuthenticated()) {
      return navigateTo("/settings/me");
    }
    return;
  }
  if (!(await AuthenticationStore().ensureAuthenticated())) {
    return navigateTo("/login");
  }
  if (to.path === "/settings" || to.path === "/settings/") {
    return navigateTo("/settings/me", { replace: true });
  }
});
