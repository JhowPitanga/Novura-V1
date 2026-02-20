import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiscalSettings } from "@/components/settings/FiscalSettings";
import { UserSettings } from "@/components/settings/UserSettings";

interface ConfiguracoesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfiguracoesModal({ open, onOpenChange }: ConfiguracoesModalProps) {
  const [activeTab, setActiveTab] = useState("fiscais");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden" aria-labelledby="configuracoes-title">
        <DialogHeader>
          <DialogTitle id="configuracoes-title">Configurações</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações</h1>
            <p className="text-gray-600">Gerencie as configurações do sistema</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mb-6 h-12 bg-gray-100">
              <TabsTrigger 
                value="fiscais" 
                className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm"
              >
                Configurações Fiscais
              </TabsTrigger>
              <TabsTrigger 
                value="usuarios"
                className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm"
              >
                Usuários
              </TabsTrigger>
            </TabsList>

            <div className="max-h-[60vh] overflow-y-auto">
              <TabsContent value="fiscais">
                <FiscalSettings />
              </TabsContent>

              <TabsContent value="usuarios">
                <UserSettings onClose={() => onOpenChange(false)} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}