import { Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { InvoiceTable } from "@/components/invoices/InvoiceTable";
import { useInvoices } from "@/hooks/useInvoices";

export default function NotasFiscais() {
  const { invoices, isLoading, error } = useInvoices();

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
                      notas={invoices}
                      loading={isLoading}
                      error={error}
                      searchPlaceholder="Buscar por número, tipo ou marketplace"
                    />
                  }
                />
                <Route
                  path="saidas"
                  element={
                    <InvoiceTable
                      notas={invoices}
                      loading={isLoading}
                      error={error}
                      tipoFilter="saida"
                      searchPlaceholder="Buscar por número ou marketplace"
                    />
                  }
                />
                <Route
                  path="entrada"
                  element={
                    <InvoiceTable
                      notas={invoices}
                      loading={isLoading}
                      error={error}
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
