import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register the Workbox-generated service worker in production only.
// In dev, Vite's HMR handles module reloading so no SW is needed.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // SW registration failure is non-fatal — app still works online
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
