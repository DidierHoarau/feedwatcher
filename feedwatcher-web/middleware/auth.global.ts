export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/users") return;
  if (!(await AuthenticationStore().ensureAuthenticated())) {
    return navigateTo("/users");
  }
});
