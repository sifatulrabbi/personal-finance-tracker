import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { createHttpClient } from "./api/http";
import { createQueryClient } from "./cache/queries";
import "./index.css";

// No visualViewport listener: sheets size themselves with dvh units, and the viewport meta
// asks browsers that support it to resize the layout for the on-screen keyboard.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App api={createHttpClient()} queryClient={createQueryClient()} />
    </BrowserRouter>
  </StrictMode>,
);
