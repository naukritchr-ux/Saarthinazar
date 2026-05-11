import {
  createBrowserRouter,
  Navigate
} from "react-router-dom";

import App from "./App";

import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import TeamUsage from "./pages/TeamUsage";
import TopUps from "./pages/TopUps";
import Invoices from "./pages/Invoices";
import UploadReports from "./pages/UploadReports";
import FinancialInsights from "./pages/FinancialInsights";
import MasterData from "./pages/MasterData";

import Login from "./pages/Login";
import Register from "./pages/Register";

import ProtectedRoute from "./components/ProtectedRoute";

const token = localStorage.getItem("token");

export const router = createBrowserRouter([

  {
    path: "/",

    element: token
      ? <Navigate to="/dashboard" />
      : <Navigate to="/login" />
  },

  {
    path: "/login",
    element: <Login />
  },

  {
    path: "/register",
    element: <Register />
  },

  {
    path: "/",
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),

    children: [

      {
        path: "/dashboard",
        element: <Dashboard />
      },

      {
        path: "/alerts",
        element: <Alerts />
      },

      {
        path: "/team-usage",
        element: <TeamUsage />
      },

      {
        path: "/topups",
        element: <TopUps />
      },

      {
        path: "/invoices",
        element: <Invoices />
      },

      {
        path: "/upload-reports",
        element: <UploadReports />
      },

      {
        path: "/financial",
        element: <FinancialInsights />
      },

      {
        path: "/master-data",
        element: <MasterData />
      }

    ]
  }

]);