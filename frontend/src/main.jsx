import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./components/AuthProvider";
import "./styles/app.css";

const DYNAMIC_IMPORT_RELOAD_KEY = "powerbi:dynamic-import-reload";

function shouldReloadForChunkError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("failed to fetch module")
  );
}

function reloadOnceForChunkError(message) {
  if (!shouldReloadForChunkError(message)) {
    return;
  }

  if (sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === "1") {
    return;
  }

  sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, "1");
  window.location.reload();
}

window.addEventListener("error", (event) => {
  reloadOnceForChunkError(event.message || event.error?.message);
});

window.addEventListener("unhandledrejection", (event) => {
  reloadOnceForChunkError(event.reason?.message || event.reason);
});

window.addEventListener("load", () => {
  sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
