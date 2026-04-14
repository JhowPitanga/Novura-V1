import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Company {
    id: string;
    razao_social: string;
    cnpj: string;
}

interface ConnectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    appName: string | undefined;
    storeName: string;
    onStoreNameChange: (name: string) => void;
    onConnect: () => void;
    companies?: Company[];
    selectedCompanyId?: string;
    onCompanyChange?: (companyId: string) => void;
}

function formatCnpj(cnpj: string): string {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return cnpj;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function ConnectDialog({
    open, onOpenChange, appName, storeName, onStoreNameChange, onConnect,
    companies = [], selectedCompanyId, onCompanyChange,
}: ConnectDialogProps) {
    const showCompanySelector = companies.length > 1;
    const isValid = storeName.trim() && (companies.length <= 1 || !!selectedCompanyId);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Conectar {appName}</DialogTitle>
                    <DialogDescription>
                        Você está prestes a conectar o {appName} ao seu sistema.
                        Isso permitirá sincronização automática de dados.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div>
                        <label className="text-sm font-medium">Nome da Loja</label>
                        <Input
                            placeholder="Digite o nome da loja"
                            value={storeName}
                            onChange={(e) => onStoreNameChange(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Obrigatório. Será exibido no card de apps conectados.
                        </p>
                    </div>

                    {showCompanySelector && (
                        <div>
                            <label className="text-sm font-medium">Empresa (CNPJ)</label>
                            <Select
                                value={selectedCompanyId ?? ""}
                                onValueChange={onCompanyChange}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="Selecione a empresa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.razao_social} — {formatCnpj(c.cnpj)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">
                                Selecione o CNPJ que será vinculado a esta integração.
                            </p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={onConnect} disabled={!isValid}>Conectar Agora</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
