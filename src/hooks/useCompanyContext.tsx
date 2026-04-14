/**
 * Company Context — tracks the active company for multi-CNPJ organizations.
 *
 * When an org has only one company the selector is hidden and behaviour is
 * identical to the legacy single-tenant flow (backward compat).
 *
 * The active company ID is persisted per-org in localStorage so it survives
 * page refreshes without re-fetching.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CompanyOption {
  id: string;
  razao_social: string;
  cnpj: string;
  is_default: boolean;
  focus_status: "pending" | "synced" | "error";
}

interface CompanyContextValue {
  companies: CompanyOption[];
  activeCompanyId: string | null;
  activeCompany: CompanyOption | null;
  setActiveCompanyId: (id: string) => void;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

function storageKey(organizationId: string) {
  return `novura:active_company:${organizationId}`;
}

export function CompanyContextProvider({ children }: { children: ReactNode }) {
  const { organizationId } = useAuth();

  const { data: companies = [], isLoading } = useQuery<CompanyOption[]>({
    queryKey: ["companies", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, razao_social, cnpj, is_default, focus_status")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  // Hydrate from localStorage on org change
  useEffect(() => {
    if (!organizationId || companies.length === 0) return;

    const stored = (() => {
      try { return localStorage.getItem(storageKey(organizationId)); } catch { return null; }
    })();

    // Use stored value if it still matches an existing company
    if (stored && companies.find((c) => c.id === stored)) {
      setActiveCompanyIdState(stored);
      return;
    }

    // Fallback: default company, then first active
    const def = companies.find((c) => c.is_default);
    setActiveCompanyIdState(def?.id ?? companies[0]?.id ?? null);
  }, [organizationId, companies]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    if (organizationId) {
      try { localStorage.setItem(storageKey(organizationId), id); } catch { /* ignore */ }
    }
  }, [organizationId]);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;

  return (
    <CompanyContext.Provider value={{ companies, activeCompanyId, activeCompany, setActiveCompanyId, isLoading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyContext must be used inside <CompanyContextProvider>");
  return ctx;
}
