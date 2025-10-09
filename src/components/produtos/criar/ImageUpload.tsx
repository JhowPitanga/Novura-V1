
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";

interface ImageUploadProps {
  selectedImages: File[];
  onImagesChange: (images: File[]) => void;
}

export function ImageUpload({ selectedImages, onImagesChange }: ImageUploadProps) {
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const remainingSlots = 8 - selectedImages.length;
    const allowed = ["image/jpeg", "image/png"]; // JPG, JPEG, PNG
    const validFiles = files
      .filter((f) => allowed.includes(f.type) && f.size <= 2 * 1024 * 1024)
      .slice(0, remainingSlots);
    
    onImagesChange([...selectedImages, ...validFiles]);
  };

  const removeImage = (index: number) => {
    onImagesChange(selectedImages.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-6">
      <Label>Imagens do Produto (até 8 fotos)</Label>
      <div className="grid grid-cols-8 gap-4 mt-4">
        {/* Imagens selecionadas */}
        {selectedImages.map((file, index) => (
          <div key={index} className="relative">
            <div className="aspect-square border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50">
              <img
                src={URL.createObjectURL(file)}
                alt={`Imagem ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => removeImage(index)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors text-xs"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        {/* Quadros para adicionar novas imagens */}
        {Array.from({ length: 8 - selectedImages.length }).map((_, index) => (
          <div key={`empty-${index}`} className="relative">
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={handleImageUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id={`image-upload-${index}`}
            />
            <label
              htmlFor={`image-upload-${index}`}
              className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors bg-gray-50"
            >
              <Plus className="w-6 h-6 text-gray-400 mb-2" />
              <span className="text-xs text-gray-500 text-center px-2">
                Adicionar
              </span>
            </label>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Formatos aceitos: JPG, JPEG e PNG. Tamanho máximo: 2MB por imagem.
      </p>
    </div>
  );
}
