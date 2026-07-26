(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-eve-slug");
  if (!slug) {
    console.error("[eve] missing data-eve-slug on embed script");
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var position =
    script.getAttribute("data-eve-position") === "left" ? "left" : "right";
  var color = script.getAttribute("data-eve-color") || "#18181b";
  var label = script.getAttribute("data-eve-label") || "Chat";

  if (document.getElementById("eve-embed-root")) return;

  var root = document.createElement("div");
  root.id = "eve-embed-root";
  root.style.cssText =
    "position:fixed;z-index:2147483000;bottom:20px;" + position + ":20px;";

  var panel = document.createElement("div");
  panel.style.cssText =
    "display:none;width:min(400px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));" +
    "margin-bottom:12px;border-radius:16px;overflow:hidden;background:#09090b;" +
    "box-shadow:0 12px 48px rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.08);";

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/embed/" + encodeURIComponent(slug);
  iframe.title = "Booking chat";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
  iframe.setAttribute("allow", "clipboard-write");
  panel.appendChild(iframe);

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "display:flex;align-items:center;justify-content:center;gap:8px;height:52px;" +
    "min-width:52px;padding:0 18px;border:0;border-radius:26px;cursor:pointer;" +
    "background:" +
    color +
    ";color:#fff;font:600 14px/1 system-ui,sans-serif;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.24);" +
    (position === "left" ? "" : "margin-left:auto;");
  button.textContent = label;

  var open = false;
  button.addEventListener("click", function () {
    open = !open;
    panel.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });

  root.appendChild(panel);
  root.appendChild(button);

  function mount() {
    document.body.appendChild(root);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
