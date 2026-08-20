import "./index.css";
import "./App";
import { registerSW } from "virtual:pwa-register";

const updateSW = registerSW({
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    console.log("PWA ready for offline use.");
  },
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    navigator.serviceWorker?.ready.then((registration) => {
      registration.update().catch(() => {
        // Ignore update errors (e.g. offline)
      });
    });
  }
});
