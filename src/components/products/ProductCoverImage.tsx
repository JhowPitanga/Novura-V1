import { useState } from "react";
import { ImageOff } from "lucide-react";

interface ProductCoverImageProps {
  imageUrl?: string | null;
  alt: string;
  sizeClassName?: string;
}

export function ProductCoverImage({
  imageUrl,
  alt,
  sizeClassName = "w-12 h-12",
}: ProductCoverImageProps) {
  const [hasError, setHasError] = useState(false);
  const showImage = Boolean(imageUrl) && !hasError;

  if (!showImage) {
    return (
      <div
        className={`${sizeClassName} rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center`}
        aria-label="Sem imagem"
      >
        <ImageOff className="w-4 h-4 text-gray-400" />
        <span className="text-[10px] font-medium text-gray-500 mt-1">Sem imagem</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl as string}
      alt={alt}
      className={`${sizeClassName} rounded-lg object-cover bg-gray-100`}
      onError={() => setHasError(true)}
    />
  );
}
