import "./index.css";
import "./App";
import { registerSW } from "virtual:pwa-register";

document.documentElement.dataset.version = typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "";

// Prevent default browser file drops on window from navigating away / reloading page
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  registerSW({
    onNeedRefresh() {
      console.log("Service Worker: New content available.");
    },
    onOfflineReady() {
      console.log("PWA ready for offline use.");
    },
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    navigator.serviceWorker?.ready.then((registration) => {
      registration.update().catch(() => {
        // Ignore update errors (e.g. offline)
      });
    });
  }
});
