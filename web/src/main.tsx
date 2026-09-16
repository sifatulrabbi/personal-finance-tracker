import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

function syncVisualViewport() {
  const root = document.documentElement;
  if (root.dataset.visualViewportOverride === "true") return;
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const layoutHeight = document.documentElement.clientHeight;
  const bottom = Math.max(0, layoutHeight - offsetTop - height);
  root.style.setProperty("--visual-viewport-height", `${height}px`);
  root.style.setProperty("--visual-viewport-bottom", `${bottom}px`);
  root.dataset.visualViewportReduced = bottom > 1 ? "true" : "false";
}

syncVisualViewport();
window.visualViewport?.addEventListener("resize", syncVisualViewport);
window.visualViewport?.addEventListener("scroll", syncVisualViewport);
window.addEventListener("resize", syncVisualViewport);
window.addEventListener("orientationchange", syncVisualViewport);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
