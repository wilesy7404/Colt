/* Show and hide mockup states only. Nothing is stored. */
(function () {
  document.querySelectorAll("[data-show]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var group = btn.getAttribute("data-group") || "default";
      var name = btn.getAttribute("data-show");
      document.querySelectorAll('[data-panel][data-group="' + group + '"]').forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-panel") !== name;
      });
      document.querySelectorAll('[data-switch][data-group="' + group + '"]').forEach(function (tab) {
        var on = tab.getAttribute("data-show") === name;
        tab.classList.toggle("is-on", on);
        tab.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  });

  document.querySelectorAll("[data-pick]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var group = btn.getAttribute("data-pick");
      document.querySelectorAll('[data-pick="' + group + '"]').forEach(function (other) {
        var on = other === btn;
        other.classList.toggle("is-on", on);
        other.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var out = document.querySelector('[data-pick-out="' + group + '"]');
      if (out) out.textContent = btn.getAttribute("data-value") || "";
      var need = document.querySelector('[data-need="' + group + '"]');
      if (need) need.hidden = true;
    });
  });

  document.querySelectorAll("[data-toggle='check']").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", on ? "false" : "true");
    });
  });
})();
