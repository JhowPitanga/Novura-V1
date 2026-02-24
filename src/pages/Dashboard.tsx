import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { useAuth } from "@/hooks/useAuth";
import { useExpiringCerts, useOrderStatusCounts } from "@/hooks/useDashboard";
import { ExpiringCertAlert } from "@/components/dashboard/ExpiringCertAlert";
import { WelcomeCard } from "@/components/dashboard/WelcomeCard";
import { OrderStatusGrid } from "@/components/dashboard/OrderStatusGrid";
import { AcademyCarousel } from "@/components/dashboard/AcademyCarousel";

const courses = [
    { id: 1, titulo: "Introdução ao Novura ERP", duracao: "15 min", nivel: "Iniciante", avaliacao: 4.9, thumbnail: "/placeholder.svg", categoria: "Fundamentos" },
    { id: 2, titulo: "Gestão de Produtos Avançada", duracao: "25 min", nivel: "Intermediário", avaliacao: 4.8, thumbnail: "/placeholder.svg", categoria: "Produtos" },
    { id: 3, titulo: "Automação de Pedidos", duracao: "20 min", nivel: "Avançado", avaliacao: 4.9, thumbnail: "/placeholder.svg", categoria: "Pedidos" },
];

export default function Index() {
    const { organizationId } = useAuth();
    const { data: expiringCerts = [], isLoading: loadingCerts } = useExpiringCerts(organizationId);
    const { data: orderStatus } = useOrderStatusCounts(organizationId);

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />
                    <main className="flex-1 p-6 overflow-auto">
                        <ExpiringCertAlert certs={expiringCerts} loading={loadingCerts} />
                        <WelcomeCard />
                        <OrderStatusGrid counts={orderStatus?.counts} delayed={orderStatus?.delayed} />
                        <AcademyCarousel courses={courses} />
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
