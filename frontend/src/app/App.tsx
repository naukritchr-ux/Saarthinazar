import Layout from "./components/Layout";
import { FYProvider } from "./context/FYContext";

// App is just the shell — routing is handled in app/routes.tsx
// main.tsx → RouterProvider → routes.tsx → ProtectedRoute → App → FYProvider → Layout → Outlet
export default function App() {
  return (
    <FYProvider>
      <Layout />
    </FYProvider>
  );
}
