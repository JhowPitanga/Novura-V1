
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";

interface ImageUploadProps {
  selectedImages: Array<File | string | { preview?: string; url?: string; file?: File } | Blob>;
  onImagesChange: (images: Array<File | string | { preview?: string; url?: string; file?: File } | Blob>) => void;
  maxImages?: number;
  maxSizeMB?: number;
  allowedMimeTypes?: string[];
  label?: string;
  showCoverBadge?: boolean;
  addLabel?: string;
  variant?: "default" | "purple";
}

export function ImageUpload({ selectedImages, onImagesChange, maxImages = 8, maxSizeMB = 2, allowedMimeTypes = ["image/jpeg","image/png"], label, showCoverBadge = false, addLabel = "Adicionar", variant = "default" }: ImageUploadProps) {
  const isPurple = variant === "purple";
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const remainingSlots = Math.max(0, maxImages - selectedImages.length);
    const allowed = allowedMimeTypes;
    const validFiles = files
      .filter((f) => allowed.includes(f.type) && f.size <= maxSizeMB * 1024 * 1024)
      .slice(0, remainingSlots);
    
    onImagesChange([...selectedImages, ...validFiles]);
  };

  const removeImage = (index: number) => {
    onImagesChange(selectedImages.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-6">
      <Label>{label || `Imagens do Produto (até ${maxImages} fotos)`}</Label>
      <div className={`grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 p-3 rounded-xl border-2 border-dashed mt-4 ${isPurple ? "border-violet-200 bg-violet-50/40" : "border-gray-200 bg-gray-50"}`}>
        {/* Imagens selecionadas */}
        {selectedImages.map((item, index) => {
          let src: string = "/placeholder.svg";
          const f: any = item as any;
          try {
            if (f instanceof File) src = URL.createObjectURL(f);
            else if (f instanceof Blob) src = URL.createObjectURL(f);
            else if (typeof f === "string") src = f;
            else if (f && typeof f === "object") {
              if (f.file instanceof File) src = URL.createObjectURL(f.file as File);
              else if (typeof f.preview === "string") src = f.preview as string;
              else if (typeof f.url === "string") src = f.url as string;
            }
          } catch {}
          return (
            <div key={index} className="relative">
              <div className={`aspect-square border-2 ${isPurple ? "border-violet-500 bg-purple-50" : "border-gray-300 bg-gray-50"} rounded-xl overflow-hidden`}>
                <img
                  src={src}
                  alt={`Imagem ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              {showCoverBadge && index === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] px-1 py-0 h-4 rounded bg-violet-600 text-white shadow">
                  Capa
                </span>
              )}
              <button
                type="button"
                onClick={() => removeImage(index)}
                className={`absolute -top-1.5 -right-1.5 ${isPurple ? "bg-violet-600 hover:bg-violet-700" : "bg-red-500 hover:bg-red-600"} text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors text-xs`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        
        {/* Quadros para adicionar novas imagens */}
        {Array.from({ length: Math.max(0, maxImages - selectedImages.length) }).map((_, index) => (
          <div key={`empty-${index}`} className="relative">
            <input
              type="file"
              accept={allowedMimeTypes.join(",")}
              multiple
              onChange={handleImageUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id={`image-upload-${index}`}
            />
            <label
              htmlFor={`image-upload-${index}`}
              className={`aspect-square border-2 border-dashed ${isPurple ? "border-violet-300 hover:border-violet-500 bg-white hover:bg-violet-50" : "border-gray-300 hover:border-gray-400 bg-white"} rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors`}
            >
              <Plus className={isPurple ? "w-5 h-5 text-violet-500 mb-1" : "w-5 h-5 text-gray-400 mb-1"} />
              <span className={`text-[11px] ${isPurple ? "text-violet-500" : "text-gray-500"} text-center px-2`}>
                {addLabel}
              </span>
            </label>
          </div>
        ))}
      </div>
      <p className={`text-xs ${isPurple ? "text-gray-700" : "text-gray-500"} mt-3`}>
        Formatos aceitos: JPG, JPEG e PNG. Tamanho máximo: {maxSizeMB}MB por imagem.
      </p>
    </div>
  );
}
