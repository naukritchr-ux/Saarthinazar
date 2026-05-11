import { useState } from "react";

import {
  useNavigate
} from "react-router-dom";

export default function Register() {

  const navigate = useNavigate();

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const handleRegister = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    const response = await fetch(
      "http://127.0.0.1:8000/auth/register",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          username,
          password,
          role: "employee"
        })
      }
    );

    const data =
      await response.json();

    if (response.ok) {

      alert(
        "Account created"
      );

      navigate("/login");
    }
    else {

      alert(data.detail);
    }
  };

  return (

    <div className="min-h-screen flex items-center justify-center bg-slate-100">

      <div className="bg-white p-10 rounded-3xl shadow-xl w-[400px]">

        <h1 className="text-3xl font-bold text-purple-600 mb-6">

          Create Account

        </h1>

        <form
          onSubmit={handleRegister}
          className="space-y-4"
        >

          <input
            type="text"
            placeholder="Username"
            className="w-full border p-3 rounded-xl"
            value={username}
            onChange={(e) =>
              setUsername(
                e.target.value
              )
            }
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border p-3 rounded-xl"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
          />

          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-3 rounded-xl hover:bg-purple-700"
          >

            Register

          </button>

        </form>

      </div>

    </div>
  );
}