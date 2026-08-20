import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register the Workbox-generated service worker in production only.
// In dev, Vite's HMR handles module reloading so no SW is needed.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      // Real bug found 2026-08-20 - a new SW version installed here but
      // waited for skipWaiting/clientsClaim (now set in vite.config.ts) to
      // actually take over; without also reloading once it does, an
      // already-open tab/PWA kept running on the OLD cached bundle even
      // after the new one took control. Force one reload the moment
      // control changes, guarded so it can only ever fire once per load.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
      // Also actively check for a waiting/new SW right away, in case one
      // finished installing before this tab loaded.
      reg.update().catch(() => {});
    }).catch(() => {
      // SW registration failure is non-fatal — app still works online
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
