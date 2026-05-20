import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User, AlertTriangle, Clock } from "lucide-react";
import { loginUser } from "../services/authService";
import { useRole } from "../context/RoleContext";
import type { Role } from "../context/RoleContext";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useRole();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show session-expired message if redirected here by apiFetch
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    const msg = sessionStorage.getItem("authMessage");
    if (msg) {
      setSessionMessage(msg);
      sessionStorage.removeItem("authMessage"); // only show once
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSessionMessage(null);
    setLoading(true);

    try {
      const data = await loginUser(username, password);

      if (data.access_token) {
        const userRole = data.role as Role;
        login(data.access_token, userRole, data.username);

        // owner (Rashesh) → Financial Insights
        // operations (Kajal) → Dashboard
        navigate(userRole === "owner" ? "/financial" : "/dashboard", { replace: true });
      } else {
        setError("Invalid username or password.");
      }
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-purple-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
            <Lock className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Naukri Monitor</h1>
          <p className="text-slate-500 mt-2">Talent Corner — Internal Portal</p>
        </div>

        {/* Session expired message */}
        {sessionMessage && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-amber-800 text-sm">{sessionMessage}</p>
          </div>
        )}

        {/* Login error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-600">Username</label>
            <div className="relative mt-2">
              <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Enter username"
                autoComplete="username"
                className="w-full border border-slate-200 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-600">Password</label>
            <div className="relative mt-2">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="password"
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full border border-slate-200 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition"
          >
            {loading ? "Signing In..." : "Login"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Operations team · Internal use only
        </p>
      </div>
    </div>
  );
}
