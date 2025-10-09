
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Variacao } from "./types";

interface VariationImageUploadProps {
  variacao: Variacao;
  onImageUpload: (variacaoId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (variacaoId: string, imageIndex: number) => void;
}

export function VariationImageUpload({ variacao, onImageUpload, onRemoveImage }: VariationImageUploadProps) {
  return (
    <div>
      <Label className="text-base font-medium">Foto de capa da variação (JPG/PNG até 2MB)</Label>
      <div className="grid grid-cols-8 gap-3 mt-4">
        {/* Única imagem de capa */}
        <div className="relative">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => onImageUpload(variacao.id, e)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            id={`image-upload-${variacao.id}-cover`}
          />
          <label
            htmlFor={`image-upload-${variacao.id}-cover`}
            className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors bg-gray-50"
          >
            {variacao.imagens && variacao.imagens.length > 0 ? (
              <div className="w-full h-full overflow-hidden rounded-lg relative">
                <img
                  src={URL.createObjectURL(variacao.imagens[0])}
                  alt={`${variacao.nome} capa`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(variacao.id, 0)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full">
                {/* Placeholder SEM FOTO em SVG leve */}
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-1">
                  <rect x="8" y="8" width="48" height="48" rx="6" stroke="#D1D5DB" strokeWidth="2" fill="#F9FAFB"/>
                  <path d="M20 44L28 34L36 40L44 30L52 44H20Z" fill="#E5E7EB"/>
                  <circle cx="28" cy="24" r="4" fill="#D1D5DB"/>
                </svg>
                <span className="text-xs text-gray-500 text-center px-1">SEM FOTO</span>
              </div>
            )}
          </label>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Apenas uma foto de capa. Formatos: JPG ou PNG. Tamanho máximo: 2MB.
      </p>
    </div>
  );
}
