import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";

interface ConfiguracoesImpressaoModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
}

export function ConfiguracoesImpressaoModal({ open, onClose, onSettingsSaved }: ConfiguracoesImpressaoModalProps) {
  const { toast } = useToast();
  const [printType, setPrintType] = useState<string>("Impressão comum PDF");
  const [labelFormat, setLabelFormat] = useState<string>("Imprimir etiqueta com DANFE SIMPLIFICADA");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const fetchSettings = async () => {
        setLoading(true);
        try {
          // Usa valores padrão se não houver configurações salvas
          setPrintType("Impressão comum PDF");
          setLabelFormat("Imprimir etiqueta com DANFE SIMPLIFICADA");
        } catch (error: any) {
          console.error("Erro ao buscar configurações de impressão:", error);
          toast({
            title: "Erro",
            description: "Falha ao carregar configurações: " + (error.message || 'Erro desconhecido'),
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      };
      fetchSettings();
    }
  }, [open, toast]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      // Simula salvamento das configurações localmente por enquanto
      console.log('Salvando configurações:', { printType, labelFormat });

      toast({
        title: "Sucesso",
        description: "Configurações de impressão salvas com sucesso!",
      });
      onSettingsSaved();
      onClose();
    } catch (error: any) {
      console.error("Erro ao salvar configurações:", error);
      toast({
        title: "Erro",
        description: "Falha ao salvar configurações: " + (error.message || 'Erro desconhecido'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" aria-describedby="config-impressao-desc" aria-labelledby="config-impressao-title">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <Printer className="w-6 h-6 text-muted-foreground" />
            <DialogTitle id="config-impressao-title" className="text-2xl font-bold">Configurações de Impressão</DialogTitle>
          </div>
          <DialogDescription id="config-impressao-desc">Defina as preferências de impressão e formato de etiqueta.</DialogDescription>
        </DialogHeader>
        <div className="flex space-x-8 mt-4">
          <div className="flex-1">
            <div className="flex items-center space-x-4 mb-4">
              <Button variant={printType === 'Etiquetas' ? 'secondary' : 'ghost'} onClick={() => {}}>Etiquetas</Button>
              <Button variant={printType === 'Lista de Separacao' ? 'secondary' : 'ghost'} onClick={() => {}}>Lista de Separacao</Button>
            </div>

            <h4 className="font-semibold text-foreground mb-2">Formato da Etiqueta</h4>
            <RadioGroup value={printType} onValueChange={setPrintType} className="space-y-2 mb-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Impressão comum PDF" id="pdf" />
                <Label htmlFor="pdf">Impressão comum PDF</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Impressão Zebra" id="zebra" />
                <Label htmlFor="zebra">Impressão Zebra</Label>
              </div>
            </RadioGroup>

            <h4 className="font-semibold text-foreground mb-2">Opção de Impressão</h4>
            <RadioGroup value={labelFormat} onValueChange={setLabelFormat} className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Imprimir etiqueta com DANFE SIMPLIFICADA" id="danfe" />
                <Label htmlFor="danfe">Imprimir etiqueta com DANFE SIMPLIFICADA</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Imprimir etiqueta casada" id="casada" />
                <Label htmlFor="casada">Imprimir etiqueta casada</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex-1 border-l border-border pl-8">
            <h4 className="font-semibold text-foreground mb-2">Visualização da Etiqueta</h4>
            <div className="bg-muted h-64 rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                <Printer className="w-12 h-12" />
                <p className="mt-2 text-sm">Pré-visualização da Etiqueta</p>
                <p className="text-xs mt-1">Formato: {printType === 'Impressão Zebra' ? 'ZPL' : 'PDF'}</p>
                <p className="text-xs">Opção: {labelFormat === 'Imprimir etiqueta com DANFE SIMPLIFICADA' ? 'DANFE Simplificada' : 'Etiqueta Casada'}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSaveSettings} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}