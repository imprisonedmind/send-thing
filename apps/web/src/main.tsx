import React from "react";
import { createRoot } from "react-dom/client";
import { light, dark } from "@send-thing/theme";
import { App } from "./App.tsx";
import { DesktopMediaViewer } from "./MediaViewer.tsx";
import "./style.css";

function applyTheme() {
  const theme = matchMedia("(prefers-color-scheme: dark)").matches
    ? dark
    : light;
  for (const [key, value] of Object.entries(theme))
    document.documentElement.style.setProperty(`--${key}`, value);
}
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  applyTheme,
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.sendThing && location.hash === "#media" ? (
      <DesktopMediaViewer />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
