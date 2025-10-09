import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Card } from "@/components/ui/card";
import { FeedTab } from "@/components/comunidade/FeedTab";
import { EventosTab } from "@/components/comunidade/EventosTab";
import { GruposTab } from "@/components/comunidade/GruposTab";

const navigationItems = [
  { title: "Feed", path: "", description: "Publicações da comunidade" },
  { title: "Eventos", path: "/eventos", description: "Eventos da comunidade" },
  { title: "Grupos", path: "/grupos", description: "Grupos e membros" },
];

export default function Comunidade() {
  const [currentPath, setCurrentPath] = useState("");

  const renderContent = () => {
    switch (currentPath) {
      case "/eventos":
        return <EventosTab />;
      case "/grupos":
        return <GruposTab />;
      default:
        return <FeedTab />;
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-white">
        <AppSidebar />
        <main className="flex-1 w-full">
          <GlobalHeader />

          <div className="px-0 py-0">
            <Card className="p-0 border-0 rounded-none">
              <div className="px-6 pt-6">
                <CleanNavigation items={navigationItems} basePath="/comunidade" onNavigate={setCurrentPath} activePath={currentPath} />
              </div>
              <div className="p-6">
                {renderContent()}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}