// Unified product image uploader — used in create and edit flows
// Handles: 1:1 crop validation, WebP conversion, upload, drag & drop reorder
import { useRef, useState, useCallback } from 'react';
import { Image, Plus, X, Star, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useProductImages } from '@/hooks/useProductImages';
import { processImageForUpload, type ImageProcessingError } from '@/utils/imageProcessor';
import type { ProductImage } from '@/services/productImages.service';

const MAX_IMAGES = 12;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB

interface PendingSlot {
  localId: string;
  previewUrl: string;
  file: File;
  status: 'pending' | 'uploading' | 'error';
  errorMessage?: string;
}

interface ProductImageUploaderProps {
  productId?: string;
  organizationId: string;
  /** Called with pending File slots when productId is not yet available (creation flow) */
  onPendingFilesChange?: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ProductImageUploader({
  productId,
  organizationId,
  onPendingFilesChange,
  disabled = false,
  className = '',
}: ProductImageUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingSlots, setPendingSlots] = useState<PendingSlot[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const { images, isLoading, upload, reorder, remove, isRemoving } = useProductImages(productId);

  const totalCount = images.length + pendingSlots.length;
  const canAdd = totalCount < MAX_IMAGES && !disabled;

  const processAndAdd = useCallback(
    async (files: File[]) => {
      const available = MAX_IMAGES - totalCount;
      const filesToProcess = files.slice(0, available);

      for (const file of filesToProcess) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast({
            title: 'Imagem inválida',
            description: 'Arquivo maior que 2MB não é permitido.',
            variant: 'destructive',
          });
          continue;
        }

        const localId = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);

        // Add pending slot immediately for preview
        setPendingSlots((prev) => [
          ...prev,
          { localId, previewUrl, file, status: 'pending' },
        ]);

        // Validate + process
        try {
          await processImageForUpload(file); // throws ImageProcessingError if invalid

          if (productId) {
            // Upload mode (editing an existing product)
            setPendingSlots((prev) =>
              prev.map((s) => (s.localId === localId ? { ...s, status: 'uploading' } : s))
            );

            await upload({
              file,
              isCover: images.length === 0 && pendingSlots.length === 0,
              position: images.length + pendingSlots.length,
              organizationId,
            });

            // Remove from pending after successful upload
            setPendingSlots((prev) => prev.filter((s) => s.localId !== localId));
            URL.revokeObjectURL(previewUrl);
          } else {
            // Creation mode — keep as pending and notify parent
            setPendingSlots((prev) => {
              const next = prev.map((s) =>
                s.localId === localId ? { ...s, status: 'pending' as const } : s
              );
              if (onPendingFilesChange) {
                onPendingFilesChange(next.map((s) => s.file));
              }
              return next;
            });
          }
        } catch (err: unknown) {
          const imgErr = err as ImageProcessingError;
          const message = imgErr?.message ?? 'Erro ao processar imagem.';
          toast({ title: 'Imagem inválida', description: message, variant: 'destructive' });
          setPendingSlots((prev) =>
            prev.map((s) =>
              s.localId === localId ? { ...s, status: 'error', errorMessage: message } : s
            )
          );
        }
      }

      if (files.length > available) {
        toast({
          title: 'Limite atingido',
          description: `Máximo de ${MAX_IMAGES} imagens por produto.`,
          variant: 'destructive',
        });
      }
    },
    [totalCount, productId, images.length, pendingSlots.length, organizationId, upload, onPendingFilesChange, toast]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) processAndAdd(files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (files.length) processAndAdd(files);
  };

  const handleRemovePending = (localId: string) => {
    setPendingSlots((prev) => {
      const next = prev.filter((s) => s.localId !== localId);
      if (onPendingFilesChange) onPendingFilesChange(next.map((s) => s.file));
      return next;
    });
  };

  const handleRemoveSaved = async (image: ProductImage) => {
    try {
      await remove({ imageId: image.id, storagePath: image.storage_path });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível remover a imagem.', variant: 'destructive' });
    }
  };

  const handleSetCover = async (imageId: string) => {
    if (!productId) return;
    const orderedIds = [imageId, ...images.filter((i) => i.id !== imageId).map((i) => i.id)];
    try {
      await reorder(orderedIds);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível definir a capa.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando imagens...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          Imagens do Produto{' '}
          <span className="text-gray-400 font-normal">
            ({totalCount}/{MAX_IMAGES})
          </span>
        </p>
        <p className="text-xs text-gray-500">
          JPG, PNG, WebP, HEIC · mín. 800×800px · máx. 1,5 MB por imagem
        </p>
      </div>

      <div
        className={`grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 p-3 rounded-xl border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-violet-500 bg-violet-50'
            : 'border-gray-200 hover:border-violet-300 bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Saved images */}
        {images.map((img) => (
          <ImageSlot
            key={img.id}
            previewUrl={img.public_url}
            isCover={img.is_cover}
            status="done"
            onRemove={() => handleRemoveSaved(img)}
            onSetCover={() => handleSetCover(img.id)}
            disabled={disabled || isRemoving}
          />
        ))}

        {/* Pending slots (creation or uploading) */}
        {pendingSlots.map((slot) => (
          <ImageSlot
            key={slot.localId}
            previewUrl={slot.previewUrl}
            isCover={images.length === 0 && pendingSlots[0]?.localId === slot.localId}
            status={slot.status}
            errorMessage={slot.errorMessage}
            onRemove={() => handleRemovePending(slot.localId)}
            disabled={disabled}
          />
        ))}

        {/* Add button */}
        {canAdd && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-violet-300 bg-white hover:border-violet-500 hover:bg-violet-50 transition-colors flex flex-col items-center justify-center gap-1 group"
            disabled={disabled}
          >
            <Plus className="w-5 h-5 text-violet-400 group-hover:text-violet-600" />
            <span className="text-xs text-violet-400 group-hover:text-violet-600 text-center px-1">
              Adicionar
            </span>
          </button>
        )}

        {totalCount === 0 && !canAdd && (
          <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
            <Image className="w-8 h-8" />
            <p className="text-sm">Nenhuma imagem adicionada</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {dragOver && (
        <p className="text-xs text-center text-violet-600">Solte as imagens aqui</p>
      )}
    </div>
  );
}

interface ImageSlotProps {
  previewUrl: string;
  isCover: boolean;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
  onRemove: () => void;
  onSetCover?: () => void;
  disabled?: boolean;
}

function ImageSlot({ previewUrl, isCover, status, errorMessage, onRemove, onSetCover, disabled }: ImageSlotProps) {
  return (
    <div className="relative aspect-square group">
      <div
        className={`w-full h-full rounded-xl overflow-hidden border-2 transition-colors ${
          isCover
            ? 'border-violet-500'
            : status === 'error'
            ? 'border-red-400'
            : 'border-gray-200 group-hover:border-violet-300'
        }`}
      >
        <img
          src={previewUrl}
          alt="Imagem do produto"
          className={`w-full h-full object-cover ${status === 'uploading' ? 'opacity-50' : ''}`}
        />

        {/* Uploading overlay */}
        {status === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="w-5 h-5 text-violet-600 animate-spin" />
          </div>
        )}

        {/* Error overlay */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/80 p-1">
            <AlertCircle className="w-4 h-4 text-red-500 mb-1" />
            <p className="text-xs text-red-600 text-center leading-tight line-clamp-3">
              {errorMessage ?? 'Erro'}
            </p>
          </div>
        )}
      </div>

      {/* Cover badge */}
      {isCover && status !== 'error' && (
        <Badge className="absolute bottom-1 left-1 text-[10px] px-1 py-0 h-4 bg-violet-600 text-white border-0">
          Capa
        </Badge>
      )}

      {/* Set as cover button (hover) */}
      {!isCover && status === 'done' && onSetCover && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute bottom-1 left-1 h-5 w-5 opacity-0 group-hover:opacity-100 bg-white/80 hover:bg-white rounded p-0"
          onClick={onSetCover}
          title="Definir como capa"
        >
          <Star className="w-3 h-3 text-violet-600" />
        </Button>
      )}

      {/* Remove button */}
      {!disabled && status !== 'uploading' && (
        <button
          type="button"
          onClick={onRemove}
          className={`absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-opacity shadow ${
            status === 'pending' || status === 'error' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          title="Remover imagem"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
