import { createBrowserRouter, Navigate } from "react-router-dom";

import App from "./App";
import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import TeamUsage from "./pages/TeamUsage";
import TopUps from "./pages/TopUps";
import Invoices from "./pages/Invoices";
import UploadReports from "./pages/UploadReports";
import FinancialInsights from "./pages/FinancialInsights";
import MasterData from "./pages/MasterData";
import PricingSetup from "./pages/PricingSetup";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";


// Blocks non-owners from reaching owner-only pages
function OwnerRoute({ children }: { children: React.ReactNode }) {
  const role = localStorage.getItem("role");
  return role === "owner"
    ? <>{children}</>
    : <Navigate to="/dashboard" replace />;
}

// Smart root redirect based on stored role
function RootRedirect() {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  const role = localStorage.getItem("role");
  return <Navigate to={role === "owner" ? "/financial" : "/dashboard"} replace />;
}


export const router = createBrowserRouter([

  { path: "/",      element: <RootRedirect /> },
  { path: "/login", element: <Login /> },

  {
    path: "/",
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [

      // ── Both roles ──────────────────────────────
      { path: "/dashboard",      element: <Dashboard /> },
      { path: "/team-usage",     element: <TeamUsage /> },
      { path: "/alerts",         element: <Alerts /> },
      { path: "/topups",         element: <TopUps /> },
      { path: "/invoices",       element: <Invoices /> },
      { path: "/upload-reports", element: <UploadReports /> },

      // ── Owner (Rashesh) only ─────────────────────
      {
        path: "/financial",
        element: <OwnerRoute><FinancialInsights /></OwnerRoute>,
      },
      {
        path: "/master-data",
        element: <OwnerRoute><MasterData /></OwnerRoute>,
      },
      {
        path: "/pricing-setup",
        element: <OwnerRoute><PricingSetup /></OwnerRoute>,
      },
    ],
  },
]);
