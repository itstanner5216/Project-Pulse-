/**
 * Custom initialization for TypeDoc to fix accessibility
 * This replaces the setTimeout pattern with a proper DOMContentLoaded approach
 */
(function () {
  function show() {
    document.documentElement.classList.add("td-ready");
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", show, { once: true });
  } else {
    show();
  }
})();
