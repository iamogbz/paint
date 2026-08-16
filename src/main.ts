import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "./App";

registerSW({
  onRegisteredSW(swUrl, r) {
    if (r) {
      setInterval(async () => {
        if (r.installing || !navigator) return;

        if ("connection" in navigator && !navigator.onLine) return;

        const resp = await fetch(swUrl, {
          cache: "no-store",
          headers: {
            cache: "no-store",
            "cache-control": "no-cache",
          },
        });

        if (resp?.status === 200) await r.update();
      }, 5 * 60 * 1000); // 5 minutes
    }
  },
});
