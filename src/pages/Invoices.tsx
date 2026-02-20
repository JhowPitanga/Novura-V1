import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceTable } from "@/components/invoices/InvoiceTable";

export default function NotasFiscais() {
  const [notasDb, setNotasDb] = useState<any[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [errorDb, setErrorDb] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotasFiscais = async () => {
      setLoadingDb(true);
      setErrorDb(null);
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("authorized_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        setErrorDb(error.message);
        setNotasDb([]);
      } else {
        setNotasDb(Array.isArray(data) ? data : []);
      }
      setLoadingDb(false);
    };
    fetchNotasFiscais();
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          <main className="flex-1 p-6 overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Controle de Notas Fiscais</h1>
                <p className="text-gray-600">Gerencie todas as suas notas fiscais de entrada, saída e compras</p>
              </div>
            </div>

            <CleanNavigation
              items={[
                { title: "Todas", path: "/todas", description: "Todas as notas" },
                { title: "Saída", path: "/saidas", description: "Notas de saída" },
                { title: "Entrada", path: "/entrada", description: "Notas de entrada" },
              ]}
              basePath="/notas-fiscais"
            />

            <div className="mt-0">
              <Routes>
                <Route
                  path="todas"
                  element={
                    <InvoiceTable
                      notas={notasDb}
                      loading={loadingDb}
                      error={errorDb}
                      searchPlaceholder="Buscar por número, tipo ou marketplace"
                    />
                  }
                />
                <Route
                  path="saidas"
                  element={
                    <InvoiceTable
                      notas={notasDb}
                      loading={loadingDb}
                      error={errorDb}
                      tipoFilter="saida"
                      searchPlaceholder="Buscar por número ou marketplace"
                    />
                  }
                />
                <Route
                  path="entrada"
                  element={
                    <InvoiceTable
                      notas={notasDb}
                      loading={loadingDb}
                      error={errorDb}
                      tipoFilter="entrada"
                      searchPlaceholder="Buscar por número ou marketplace"
                      showAddButton
                      showCancelAction={false}
                    />
                  }
                />
                <Route index element={<Navigate to="todas" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
