import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/globals.css";
import { Handoff } from "./Handoff";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Handoff />
  </StrictMode>,
);
