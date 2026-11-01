import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/globals.css";
import { Discover } from "./Discover";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Discover />
  </StrictMode>,
);
