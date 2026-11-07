import React from "react";
import ReactDOM from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import App from "./App";
import contentVersions from "virtual:content-versions";
import { configureResourceVersions } from "./lib/resource-url";

configureResourceVersions(contentVersions);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
