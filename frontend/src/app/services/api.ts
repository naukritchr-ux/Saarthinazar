// Single source of truth for the API base URL.
// In development: set via .env.local → VITE_API_URL=http://localhost:8000
// In production:  set via .env.production → VITE_API_URL=https://saarthinazar-backend.onrender.com
const API = import.meta.env.VITE_API_URL as string;

if (!API) {
  console.error(
    "[api.ts] VITE_API_URL is not set. " +
    "Create frontend/.env.local with VITE_API_URL=http://localhost:8000 for local dev."
  );
}

export default API;

// =====================================================
// AUTHENTICATED FETCH WRAPPER
// Automatically handles 401 — clears token and
// redirects to login with a session-expired message.
// Use this instead of raw fetch() for all protected
// API calls that require authentication.
// =====================================================

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  // Token expired or invalid — clear session and force re-login
  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    // Message shown on login page
    sessionStorage.setItem(
      "authMessage",
      "Your session has expired. Please log in again."
    );
    window.location.href = "/login";
  }

  return response;
}
