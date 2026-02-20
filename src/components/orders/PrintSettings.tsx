import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PrintingSettings } from "@/types/pedidos";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface PrintSettingsProps {
    settings: PrintingSettings;
    onSettingsChange: (newSettings: PrintingSettings) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPrint: () => void;
}

export function PrintSettings({ settings, onSettingsChange, open, onOpenChange, onPrint }: PrintSettingsProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Configurações de Impressão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Ajuste as opções de impressão para a lista de separação e etiquetas.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-6">
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold">Lista de Separação (Picking List)</h4>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="groupByProduct"
                                checked={settings.pickingList.groupByProduct}
                                onCheckedChange={(checked) => onSettingsChange({
                                    ...settings,
                                    pickingList: { ...settings.pickingList, groupByProduct: checked as boolean }
                                })}
                            />
                            <Label htmlFor="groupByProduct">Agrupar por produto</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="includeOrderNumber"
                                checked={settings.pickingList.includeOrderNumber}
                                onCheckedChange={(checked) => onSettingsChange({
                                    ...settings,
                                    pickingList: { ...settings.pickingList, includeOrderNumber: checked as boolean }
                                })}
                            />
                            <Label htmlFor="includeOrderNumber">Incluir número do pedido na lista</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="includeBarcode"
                                checked={settings.pickingList.includeBarcode}
                                onCheckedChange={(checked) => onSettingsChange({
                                    ...settings,
                                    pickingList: { ...settings.pickingList, includeBarcode: checked as boolean }
                                })}
                            />
                            <Label htmlFor="includeBarcode">Incluir código de barras</Label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold">Etiqueta</h4>
                        <div>
                            <p className="text-sm font-medium leading-none mb-2">Tamanho da Etiqueta</p>
                            <RadioGroup
                                defaultValue={settings.label.labelSize}
                                onValueChange={(value: "10x15" | "A4") => onSettingsChange({
                                    ...settings,
                                    label: { ...settings.label, labelSize: value }
                                })}
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="10x15" id="10x15" />
                                    <Label htmlFor="10x15">10x15</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="A4" id="A4" />
                                    <Label htmlFor="A4">A4</Label>
                                </div>
                            </RadioGroup>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="separateLabelPerItem"
                                checked={settings.label.separateLabelPerItem}
                                onCheckedChange={(checked) => onSettingsChange({
                                    ...settings,
                                    label: { ...settings.label, separateLabelPerItem: checked as boolean }
                                })}
                            />
                            <Label htmlFor="separateLabelPerItem">Gerar uma etiqueta para cada item</Label>
                        </div>
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onPrint}>Imprimir</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}