// Applies the saved theme before first paint so dark mode never flashes light. A separate
// file because the server's Content-Security-Policy allows only same-origin scripts.
// Mirrors src/theme/theme.ts (readPreference, resolveTheme, applyTheme).
(function () {
  var preference = "system";
  try {
    var saved = localStorage.getItem("simply-finance-theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (e) {}
  var dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
