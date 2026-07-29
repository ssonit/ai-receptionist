(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var siteId = script.getAttribute("data-eve-id");
  var slug = script.getAttribute("data-eve-slug");
  var embedKey = (siteId && siteId.trim()) || (slug && slug.trim()) || "";
  if (!embedKey) {
    console.error("[eve] missing data-eve-id (or legacy data-eve-slug) on embed script");
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var position =
    script.getAttribute("data-eve-position") === "left" ? "left" : "right";
  var color = script.getAttribute("data-eve-color") || "#18181b";
  var label = script.getAttribute("data-eve-label") || "Chat";
  var logoUrl =
    script.getAttribute("data-eve-logo") || origin + "/logo.png";

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
  iframe.src = origin + "/embed/" + encodeURIComponent(embedKey);
  iframe.title = "Booking chat";
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
  iframe.setAttribute("allow", "clipboard-write");
  panel.appendChild(iframe);

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "display:flex;align-items:center;justify-content:center;width:56px;height:56px;" +
    "padding:0;border:0;border-radius:50%;cursor:pointer;overflow:hidden;" +
    "background:" +
    color +
    ";box-shadow:0 6px 20px rgba(0,0,0,.24);" +
    (position === "left" ? "" : "margin-left:auto;");

  var logo = document.createElement("img");
  logo.src = logoUrl;
  logo.alt = "";
  logo.setAttribute("aria-hidden", "true");
  logo.width = 56;
  logo.height = 56;
  logo.style.cssText =
    "display:block;width:56px;height:56px;object-fit:cover;pointer-events:none;";
  button.appendChild(logo);

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
