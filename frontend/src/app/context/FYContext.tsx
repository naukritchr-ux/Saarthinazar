import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import API from "../services/api";

const _API = API;

export interface FinancialYear {
  id: number;
  label: string;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
}

interface FYContextType {
  financialYear: string;
  setFinancialYear: (fy: string) => void;
  financialYears: FinancialYear[];
  refreshFYs: () => void;
  isLoading: boolean;
  error: string | null;
}

const FYContext = createContext<FYContextType | undefined>(undefined);

export function FYProvider({ children }: { children: ReactNode }) {
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [financialYear, setFinancialYear] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFYs = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    fetch(`${API}/dashboard/financial-years`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP Error: ${r.status}`);
        }
        return r.json();
      })
      .then((data: FinancialYear[]) => {
        if (!Array.isArray(data)) {
          throw new Error("Invalid response format");
        }
        
        setFinancialYears(data);
        
        // Set default FY if nothing is selected yet
        setFinancialYear((prev) => {
          if (prev) return prev;
          
          // First, try to find active FY based on date
          const active = data.find((y) => y.is_active);
          if (active) return active.label;
          
          // Fallback to 2025-2026 if it exists
          const default2025 = data.find((y) => y.label === "2025-2026");
          if (default2025) return default2025.label;
          
          // Otherwise use the first one
          return data[0]?.label ?? "";
        });
        
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch financial years:", err);
        setError(err.message);
        setIsLoading(false);
        
        // Fallback: set a default FY
        setFinancialYear("2025-2026");
      });
  }, []);

  useEffect(() => {
    fetchFYs();
  }, [fetchFYs]);

  return (
    <FYContext.Provider
      value={{
        financialYear,
        setFinancialYear,
        financialYears,
        refreshFYs: fetchFYs,
        isLoading,
        error,
      }}
    >
      {children}
    </FYContext.Provider>
  );
}

export function useFY() {
  const ctx = useContext(FYContext);
  if (!ctx) throw new Error("useFY must be used within FYProvider");
  return ctx;
}
