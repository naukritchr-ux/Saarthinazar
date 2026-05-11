import { useState } from "react";

import {
  useNavigate,
  Link
} from "react-router-dom";

import {
  Lock,
  User
} from "lucide-react";

import { loginUser } from "../services/authService";

export default function Login() {

  const navigate = useNavigate();

  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleLogin = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    setLoading(true);

    const data = await loginUser(
      username,
      password
    );

    setLoading(false);

    if (data.access_token) {

      localStorage.setItem(
        "token",
        data.access_token
      );

      localStorage.setItem(
        "role",
        data.role
      );

      localStorage.setItem(
        "username",
        data.username
      );

      alert(`Welcome ${data.username}`);

      navigate("/dashboard");
    }
    else {

      alert("Invalid credentials");
    }
  };

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-purple-100 flex items-center justify-center p-6">

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">

        <div className="text-center mb-8">

          <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4">

            <Lock className="text-white w-8 h-8" />

          </div>

          <h1 className="text-3xl font-bold text-slate-800">

            Welcome Back

          </h1>

          <p className="text-slate-500 mt-2">

            Login to continue

          </p>

        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-5"
        >

          <div>

            <label className="text-sm font-medium text-slate-600">

              Username

            </label>

            <div className="relative mt-2">

              <User className="absolute left-4 top-4 w-5 h-5 text-slate-400" />

              <input
                type="text"
                placeholder="Enter username"
                className="w-full border border-slate-200 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
              />

            </div>

          </div>

          <div>

            <label className="text-sm font-medium text-slate-600">

              Password

            </label>

            <div className="relative mt-2">

              <Lock className="absolute left-4 top-4 w-5 h-5 text-slate-400" />

              <input
                type="password"
                placeholder="Enter password"
                className="w-full border border-slate-200 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
              />

            </div>

          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-medium transition"
          >

            {loading
              ? "Signing In..."
              : "Login"}

          </button>

        </form>

        <p className="text-center text-sm text-slate-500 mt-6">

          Need an account?

          <Link
            to="/register"
            className="text-purple-600 ml-2 font-medium"
          >

            Register

          </Link>

        </p>

      </div>

    </div>
  );
}