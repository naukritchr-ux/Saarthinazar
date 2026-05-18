import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

// Matches actual role values stored in the DB
export type Role = "owner" | "operations";

interface AuthContextType {
  role: Role | null;
  username: string | null;
  token: string | null;
  isLoggedIn: boolean;
  isOwner: boolean;
  login: (token: string, role: Role, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {

  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );
  const [role, setRole] = useState<Role | null>(
    () => (localStorage.getItem("role") as Role) || null
  );
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem("username")
  );

  const isLoggedIn = !!token && !!role;

  // Rashesh is "owner", Kajal is "operations"
  const isOwner = role === "owner";

  const login = (t: string, r: Role, u: string) => {
    localStorage.setItem("token", t);
    localStorage.setItem("role", r);
    localStorage.setItem("username", u);
    setToken(t);
    setRole(r);
    setUsername(u);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    setToken(null);
    setRole(null);
    setUsername(null);
  };

  return (
    <AuthContext.Provider
      value={{ role, username, token, isLoggedIn, isOwner, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useRole() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useRole must be used within RoleProvider");
  }
  return context;
}
