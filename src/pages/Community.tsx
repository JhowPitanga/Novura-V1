import { useState } from "react";

// Layout providers & components
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Card } from "@/components/ui/card";

// Community module components
import { FeedTab } from "@/components/community/FeedTab";
import { ComposerModal } from "@/components/community/ComposerModal";
import { ProfileTab } from "@/components/community/ProfileTab";

const navigationItems = [
  { title: "Perfil", path: "/perfil", description: "Perfil da comunidade" },
  { title: "Feed", path: "", description: "Publicações da comunidade" },
];

export default function Comunidade() {
  const [currentPath, setCurrentPath] = useState("");
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);

  const renderContent = () => {
    switch (currentPath) {
      case "/perfil":
        return <ProfileTab />;
      default:
        return <FeedTab onOpenCreatePost={() => setIsCreatePostModalOpen(true)} />;
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AppSidebar />

        <main className="flex-1 w-full">
          <GlobalHeader />

          <div className="p-0">
            <Card className="p-0 border-0 rounded-none shadow-none">
              {/* Sticky navigation header */}
              <div className="pt-6 bg-white border-b sticky top-0 z-10">
                <div className="w-[750px] mx-auto">
                  <CleanNavigation
                    items={navigationItems}
                    basePath="/comunidade"
                    onNavigate={setCurrentPath}
                    activePath={currentPath}
                  />
                </div>
              </div>

              {/* Content area */}
              <div className="pt-6 pb-20 w-full">
                <div className="w-[1500px] mx-auto">
                  {renderContent()}
                </div>
              </div>
            </Card>
          </div>
        </main>
      </div>

      {/* Post creation modal */}
      {isCreatePostModalOpen && (
        <ComposerModal onClose={() => setIsCreatePostModalOpen(false)} />
      )}
    </SidebarProvider>
  );
}