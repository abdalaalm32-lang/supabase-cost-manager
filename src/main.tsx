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

// Initialize theme before render
const savedTheme = localStorage.getItem("theme") || "dark";
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
