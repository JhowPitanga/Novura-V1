
import type React from "react";
import { Label } from "@/components/ui/label";
import { Variacao } from "./types";
import { ImageUpload } from "@/components/products/create/ImageUpload";

interface VariationImageUploadProps {
  variacao: Variacao;
  onImageUpload: (variacaoId: string, payload: React.ChangeEvent<HTMLInputElement> | File) => void;
  onRemoveImage: (variacaoId: string, imageIndex: number) => void;
}

export function VariationImageUpload({ variacao, onImageUpload, onRemoveImage }: VariationImageUploadProps) {
  const selectedImages = Array.isArray(variacao.imagens) ? variacao.imagens : [];

  return (
    <div>
      <Label className="text-base font-medium">Foto de capa da variação (JPG/PNG até 2MB)</Label>
      <ImageUpload
        selectedImages={selectedImages}
        onImagesChange={(images) => {
          const next = images as File[];
          if (next.length === 0) {
            onRemoveImage(variacao.id, 0);
            return;
          }
          const file = next[0];
          if (!(file instanceof File)) return;
          onImageUpload(variacao.id, file);
        }}
        maxImages={1}
        maxSizeMB={2}
        allowedMimeTypes={["image/jpeg", "image/png"]}
        label=""
        showCoverBadge
        addLabel="Adicionar"
        variant="purple"
      />
      <p className="text-xs text-gray-500 mt-2">
        Apenas uma foto de capa. Formatos: JPG ou PNG. Tamanho máximo: 2MB.
      </p>
    </div>
  );
}
