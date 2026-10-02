// Runs in <head> before first paint, so a saved theme choice never flashes the other theme.
(function () {
  try {
    var saved = localStorage.getItem('lucidiff:theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch {
    // Storage can be unavailable (private mode, file:// restrictions). Follow the system theme.
  }
})();
