import {
  Link,
  Outlet,
  useLocation,
  useNavigate
} from "react-router-dom";

import {
  LayoutDashboard,
  Users,
  Bell,
  Plus,
  FileText,
  TrendingUp,
  Settings as SettingsIcon,
  Upload,
  LogOut
} from "lucide-react";

import { useState, useEffect } from "react";

export default function Layout() {

  const location = useLocation();
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(false);

  const role =
    localStorage.getItem("role");
  const isOwner =
    role === "owner" || role === "admin" || role === "rashesh";

  const username =
    localStorage.getItem("username") || "User";

  const profileImage =
    localStorage.getItem("profileImage");

  const isActive = (path: string) =>
    location.pathname === path;

  const navItems = [

    {
      path: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      visible: true
    },

    {
      path: "/team-usage",
      label: "Team Usage",
      icon: Users,
      visible: true
    },

    {
      path: "/alerts",
      label: "Alerts",
      icon: Bell,
      visible: true
    },

    {
      path: "/topups",
      label: "Top-Ups",
      icon: Plus,
      visible: true
    },

    {
      path: "/invoices",
      label: "Invoices & Payments",
      icon: FileText,
      visible: true
    },

    {
      path: "/upload-reports",
      label: "Upload Reports",
      icon: Upload,
      visible: true
    },

    {
      path: "/financial",
      label: "Financial Insights",
      icon: TrendingUp,
      visible: isOwner
    },

    {
      path: "/master-data",
      label: "Master Data",
      icon: SettingsIcon,
      visible: isOwner
    }

  ];

  const handleLogout = () => {

    localStorage.clear();

    window.location.href = "/login";
  };

  // Show welcome banner on dashboard load
  useEffect(() => {
    if (location.pathname === "/dashboard") {
      setShowWelcome(true);
      const timer = setTimeout(() => setShowWelcome(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  return (

    <div className="min-h-screen bg-slate-100">

      {/* WELCOME BANNER */}
      {showWelcome && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-8 py-4 shadow-lg border-b-4 border-purple-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Welcome back, {username}! 👋</h2>
              <p className="text-purple-100 text-sm mt-1">
                {role === "admin" ? "You have full system access" : "You're logged in as an employee"}
              </p>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="text-purple-100 hover:text-white transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">

        <div className="px-8 py-4">

          <div className="flex items-center justify-between">

            {/* LEFT SECTION */}

            <div className="flex items-center gap-10">

              <div>

                <h1 className="text-2xl font-bold text-purple-600">

                  Naukri Usage Monitor

                </h1>

                <p className="text-xs text-slate-500 mt-1">

                  Recruitment Billing & Analytics System

                </p>

              </div>

              <nav className="flex items-center gap-2">

                {navItems
                  .filter((item) => item.visible)
                  .map((item) => (

                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 text-sm font-medium ${
                        isActive(item.path)
                          ? "bg-purple-100 text-purple-700 shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >

                      <item.icon className="w-4 h-4" />

                      <span>
                        {item.label}
                      </span>

                    </Link>

                  ))}

              </nav>

            </div>

            {/* RIGHT SECTION */}

            <div className="flex items-center gap-5">

              <div className="hidden md:block text-right">

                <p className="text-sm text-slate-500">

                  Welcome back,

                </p>

                <p className="font-semibold text-slate-700">

                  {username}

                </p>

              </div>

              {/* PROFILE DROPDOWN */}

              <div className="relative group">

                <button className="flex items-center gap-3">

                  <div className="w-11 h-11 bg-purple-600 rounded-full overflow-hidden flex items-center justify-center text-white font-semibold text-lg shadow">

                    {profileImage ? (

                      <img
                        src={profileImage}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />

                    ) : (

                      username.charAt(0).toUpperCase()

                    )}

                  </div>

                  <div className="hidden md:block text-left">

                    <p className="font-semibold text-slate-700">

                      {username}

                    </p>

                    <p className="text-xs text-slate-500 capitalize">

                      {role}

                    </p>

                  </div>

                </button>

                {/* DROPDOWN MENU */}

                <div className="absolute right-0 mt-3 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">

                  <div className="p-4 border-b">

                    <p className="font-semibold">

                      {username}

                    </p>

                    <p className="text-xs text-slate-500 capitalize">

                      {role}

                    </p>

                  </div>

                  {/* UPLOAD IMAGE */}

                  <label className="block px-4 py-3 text-sm hover:bg-slate-50 cursor-pointer">

                    Upload Profile Image

                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) => {

                        const file =
                          e.target.files?.[0];

                        if (!file) return;

                        const reader =
                          new FileReader();

                        reader.onloadend = () => {

                          localStorage.setItem(
                            "profileImage",
                            reader.result as string
                          );

                          window.location.reload();
                        };

                        reader.readAsDataURL(file);
                      }}
                    />

                  </label>

                  {/* CHANGE PASSWORD */}

                  <button
                    onClick={() => {

                      const oldPassword =
                        prompt("Enter old password");

                      const newPassword =
                        prompt("Enter new password");

                      if (
                        !oldPassword ||
                        !newPassword
                      ) return;

                      fetch(
                        "http://127.0.0.1:8000/auth/change-password",
                        {
                          method: "POST",

                          headers: {
                            "Content-Type":
                              "application/json"
                          },

                          body: JSON.stringify({
                            old_password:
                              oldPassword,

                            new_password:
                              newPassword
                          })
                        }
                      )
                      .then((res) => res.json())
                      .then(() => {

                        alert(
                          "Password updated"
                        );
                      });
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                  >

                    Change Password

                  </button>

                  {/* LOGOUT */}

                  <button
                    onClick={handleLogout}
                    title="Logout"
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-red-50 rounded-b-2xl"
                  >

                    <LogOut className="w-4 h-4" />

                    Logout

                  </button>

                </div>

              </div>

            </div>

          </div>

        </div>

      </header>

      <main className="p-6">

        <Outlet />

      </main>

    </div>
  );
}
