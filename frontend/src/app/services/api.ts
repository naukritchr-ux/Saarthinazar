// Single source of truth for the API base URL.
// In development: http://127.0.0.1:8000
// In production: the VITE_API_URL env variable (set in .env.production)
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default API;
