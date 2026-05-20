import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
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
  LogOut,
  ChevronDown,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";
import { useFY } from "../context/FYContext";

export default function Layout() {

  const location = useLocation();
  const navigate = useNavigate();
  const { financialYear, setFinancialYear, financialYears, isLoading: fyLoading } = useFY();

  const [showWelcome, setShowWelcome] = useState(true);
  const [fyDropdownOpen, setFyDropdownOpen] = useState(false);

  const role = localStorage.getItem("role") || "";
  const username = localStorage.getItem("username") || "User";
  const profileImage = localStorage.getItem("profileImage");

  // Rashesh is the owner — Kajal is operations
  const isOwner =
    role.toLowerCase() === "rashesh" ||
    role.toLowerCase() === "owner" ||
    role.toLowerCase() === "admin";

  const isActive = (path: string) => location.pathname === path;

  // =====================================================
  // NAVIGATION
  // Rashesh sees everything. Kajal sees all except
  // Financial Insights and Master Data.
  // =====================================================

  const navItems = [
    {
      path: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      visible: true,
    },
    {
      path: "/team-usage",
      label: "Team Usage",
      icon: Users,
      visible: true,
    },
    {
      path: "/alerts",
      label: "Alerts",
      icon: Bell,
      visible: true,
    },
    {
      path: "/topups",
      label: "Top-Ups",
      icon: Plus,
      visible: true,
    },
    {
      path: "/invoices",
      label: "Invoices & Payments",
      icon: FileText,
      visible: true,
    },
    {
      path: "/upload-reports",
      label: "Upload Reports",
      icon: Upload,
      visible: true,
    },
    {
      path: "/financial",
      label: "Financial Insights",
      icon: TrendingUp,
      visible: isOwner,   // Kajal never sees this
    },
    {
      path: "/master-data",
      label: "Master Data",
      icon: SettingsIcon,
      visible: isOwner,   // Kajal never sees this
    },
  ];

  // =====================================================
  // WELCOME BANNER — shows for 5s on dashboard
  // =====================================================

  useEffect(() => {
    if (location.pathname === "/dashboard") {
      setShowWelcome(true);
      const timer = setTimeout(() => setShowWelcome(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // =====================================================
  // LOGOUT — use navigate, not window.location.href
  // =====================================================

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // =====================================================
  // CHANGE PASSWORD
  // =====================================================

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordSuccess(false);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        "http://127.0.0.1:8000/auth/change-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            old_password: oldPassword,
            new_password: newPassword,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setPasswordSuccess(true);
        setOldPassword("");
        setNewPassword("");
        setTimeout(() => setShowPasswordModal(false), 1500);
      } else {
        setPasswordError(data.detail || "Failed to update password.");
      }
    } catch {
      setPasswordError("Server error. Please try again.");
    }
  };

  // =====================================================
  // PROFILE IMAGE
  // =====================================================

  const handleProfileUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      localStorage.setItem("profileImage", reader.result as string);
      window.location.reload();
    };
    reader.readAsDataURL(file);
  };

  // =====================================================
  // DELETE PROFILE PICTURE
  // =====================================================

  const handleDeleteProfilePicture = async () => {
    const token = localStorage.getItem("token");
    try {
      await fetch("http://127.0.0.1:8000/auth/delete-pfp", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Even if backend fails, clear locally
    }
    localStorage.removeItem("profileImage");
    window.location.reload();
  };

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="min-h-screen bg-slate-100">

      {/* WELCOME BANNER */}
      {showWelcome && location.pathname === "/dashboard" && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-8 py-4 shadow-lg border-b-4 border-purple-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Welcome back, {username}! 👋
              </h2>
              <p className="text-purple-100 text-sm mt-1">
                {isOwner
                  ? "You have full system access"
                  : "Operations access"}
              </p>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="text-purple-100 hover:text-white transition text-xl"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">

            {/* LEFT — logo + nav */}
            <div className="flex items-center gap-10">
              <div>
                <h1 className="text-2xl font-bold text-purple-600">
                  Naukri Usage Monitor
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Recruitment Billing & Analytics System
                </p>
              </div>

              <nav className="flex items-center gap-1">
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
                      <span>{item.label}</span>
                    </Link>
                  ))}
              </nav>
            </div>

            {/* CENTER — FY SELECTOR */}
            <div className="flex-1 flex justify-center px-8">
              <div className="relative">
                <button
                  onClick={() => setFyDropdownOpen(!fyDropdownOpen)}
                  disabled={fyLoading}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-xl bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed transition"
                >
                  <span className="font-medium text-slate-700">
                    FY {financialYear || "Loading..."}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${fyDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* FY DROPDOWN */}
                {fyDropdownOpen && (
                  <div className="absolute top-full mt-2 left-0 w-48 bg-white border border-slate-300 rounded-xl shadow-lg z-50">
                    {fyLoading ? (
                      <div className="px-4 py-3 text-sm text-slate-500 text-center">Loading years...</div>
                    ) : financialYears.length > 0 ? (
                      financialYears.map((fy) => (
                        <button
                          key={fy.id}
                          onClick={() => {
                            setFinancialYear(fy.label);
                            setFyDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition ${
                            financialYear === fy.label
                              ? "bg-purple-100 text-purple-700 font-medium"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          FY {fy.label}
                          {fy.is_active && <span className="ml-2 text-xs text-green-600">● Active</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 text-center">No years found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — user profile */}
            <div className="flex items-center gap-5">

              <div className="hidden md:block text-right">
                <p className="text-sm text-slate-500">Logged in as</p>
                <p className="font-semibold text-slate-700 capitalize">
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
                    <p className="font-semibold text-slate-700 capitalize">
                      {username}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isOwner ? "Owner" : "Operations"}
                    </p>
                  </div>
                </button>

                {/* DROPDOWN MENU */}
                <div className="absolute right-0 mt-3 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="p-4 border-b">
                    <p className="font-semibold capitalize">{username}</p>
                    <p className="text-xs text-slate-500">
                      {isOwner ? "Owner" : "Operations"}
                    </p>
                  </div>

                  <label className="block px-4 py-3 text-sm hover:bg-slate-50 cursor-pointer">
                    Upload Profile Image
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={handleProfileUpload}
                    />
                  </label>

                  {profileImage && (
                    <button
                      onClick={handleDeleteProfilePicture}
                      className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50"
                    >
                      Remove Profile Image
                    </button>
                  )}

                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    Change Password
                  </button>

                  <button
                    onClick={handleLogout}
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

      {/* MAIN CONTENT */}
      <main className="p-6">
        <Outlet />
      </main>

      {/* CHANGE PASSWORD MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">Change Password</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600">
                  Current Password
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl py-3 px-4 mt-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl py-3 px-4 mt-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {passwordError && (
                <p className="text-red-600 text-sm">{passwordError}</p>
              )}

              {passwordSuccess && (
                <p className="text-green-600 text-sm font-medium">
                  Password updated successfully!
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setOldPassword("");
                  setNewPassword("");
                  setPasswordError("");
                }}
                className="flex-1 border border-slate-200 rounded-xl py-3 text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={!oldPassword || !newPassword}
                className="flex-1 bg-purple-600 text-white rounded-xl py-3 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
