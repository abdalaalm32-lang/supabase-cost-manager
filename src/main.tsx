import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Disable stale service workers/caches that can cause black-screen stale builds
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
}

if ("caches" in window) {
  void caches.keys().then((keys) => {
    keys.forEach((key) => {
      if (key.includes("3mgsc") || key.includes("workbox") || key.includes("vite")) {
        void caches.delete(key);
      }
    });
  });
}

// Recover from stale chunk references after a new deploy (blank screen fix)
const RELOAD_FLAG = "chunk-reload-attempt";
const recoverFromStaleChunks = () => {
  if (sessionStorage.getItem(RELOAD_FLAG)) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  if ("caches" in window) {
    void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(() => {
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  recoverFromStaleChunks();
});

window.addEventListener("error", (event) => {
  const msg = String((event as ErrorEvent)?.message || "");
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("error loading dynamically imported module")) {
    recoverFromStaleChunks();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = String((event as PromiseRejectionEvent)?.reason?.message || "");
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("error loading dynamically imported module")) {
    recoverFromStaleChunks();
  }
});

// Clear the guard once the app has stayed up for a while, so a future deploy can recover again
window.setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 15000);

// Initialize theme before render
const savedTheme = localStorage.getItem("theme") || "dark";
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
