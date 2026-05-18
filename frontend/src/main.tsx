import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { RoleProvider } from "./app/context/RoleContext";
import { router } from "./app/routes";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/*
      RoleProvider MUST wrap RouterProvider so every page/component
      that calls useRole() finds the context in the tree.
      This was the root cause of the crash.
    */}
    <RoleProvider>
      <RouterProvider router={router} />
    </RoleProvider>
  </React.StrictMode>
);
