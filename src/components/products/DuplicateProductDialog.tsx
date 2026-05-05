// T11 — Dialog for confirming product duplication
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDuplicateProduct } from "@/hooks/useDuplicateProduct";

interface DuplicateProductDialogProps {
  productId: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicateProductDialog({
  productId,
  productName,
  open,
  onOpenChange,
}: DuplicateProductDialogProps) {
  const [withImages, setWithImages] = useState(false);
  const { duplicate, isDuplicating } = useDuplicateProduct();

  const handleConfirm = () => {
    duplicate({ productId, withImages });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-violet-600" />
            Duplicar Produto
          </AlertDialogTitle>
          <AlertDialogDescription>
            Uma cópia de <strong>"{productName}"</strong> será criada com um novo SKU gerado
            automaticamente. Estoque e vínculos de anúncios <strong>não são copiados</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-3 py-2">
          <Checkbox
            id="with-images"
            checked={withImages}
            onCheckedChange={(v) => setWithImages(!!v)}
          />
          <Label htmlFor="with-images" className="cursor-pointer text-sm">
            Incluir imagens na cópia{" "}
            <span className="text-gray-400 font-normal">(compartilha os mesmos arquivos)</span>
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDuplicating}
            className="bg-violet-700 hover:bg-violet-800 text-white"
          >
            {isDuplicating ? "Duplicando..." : "Duplicar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
