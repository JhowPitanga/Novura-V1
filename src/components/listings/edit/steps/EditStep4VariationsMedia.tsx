import { EditListingStepVariationsMedia } from "@/components/listings/EditListingStepVariationsMedia";
import type { MarketplaceAdapter } from "@/adapters/listings/types";
import type { VariationLite } from "@/components/listings/editListing.types";
import { useState } from "react";

interface EditStep4VariationsMediaProps {
  adapter: MarketplaceAdapter;
  variations: any[];
  setVariations: (v: any[]) => void;
  pictures: (string | File)[];
  setPictures: (v: (string | File)[]) => void;
  videoId: string;
  setVideoId: (v: string) => void;
  primaryVariationIndex: number | null;
  setPrimaryVariationIndex: (v: number | null) => void;
  allowVariationAttrs: any[];
  price: string;
  saving: string | null;
  onSaveVariations: () => Promise<void>;
  onSavePictures: () => Promise<void>;
  onSaveVideo: () => Promise<void>;
}

export function EditStep4VariationsMedia({
  adapter,
  variations,
  setVariations,
  pictures,
  setPictures,
  videoId,
  setVideoId,
  primaryVariationIndex,
  setPrimaryVariationIndex,
  allowVariationAttrs,
  price,
  saving,
  onSaveVariations,
  onSavePictures,
  onSaveVideo,
}: EditStep4VariationsMediaProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const getVariationPreviewUrl = (v: VariationLite): string => {
    const files = Array.isArray(v?.pictureFiles) ? v.pictureFiles : [];
    const first = files[0];
    if (typeof first === 'string') return first;
    if (first instanceof File) return URL.createObjectURL(first);
    return v?.image || '/placeholder.svg';
  };

  const handleAddVariation = () => {
    const newVar: VariationLite = {
      id: `NEW_${Date.now()}`,
      available_quantity: 1,
      price: Number(price) || 0,
      attributes: allowVariationAttrs.map((a: any) => ({
        id: a.id,
        name: a.name,
        value_name: "",
      })),
    };
    setVariations([...variations, newVar]);
  };

  const handleRemoveVariation = (index: number) => {
    const next = [...variations];
    next.splice(index, 1);
    setVariations(next);
  };

  const handleUpdateVariation = (index: number, patch: Partial<VariationLite>) => {
    const next = [...variations];
    next[index] = { ...next[index], ...patch };
    setVariations(next);
  };

  const handleUpdateVariationPictures = (index: number, files: (File | string)[]) => {
    const next = [...variations];
    next[index] = { ...next[index], pictureFiles: files };
    setVariations(next);
  };

  const handleVideoChange = (v: File | string | null) => {
    if (v instanceof File) {
      setVideoFile(v);
      return;
    }
    setVideoFile(null);
    setVideoId(typeof v === 'string' ? v : '');
  };

  return (
    <EditListingStepVariationsMedia
      variations={variations as VariationLite[]}
      allowVariationAttrs={allowVariationAttrs}
      pictures={pictures}
      videoFile={videoFile}
      videoId={videoId}
      primaryVariationIndex={primaryVariationIndex}
      price={price}
      savingKey={saving}
      getVariationPreviewUrl={getVariationPreviewUrl}
      onAddVariation={handleAddVariation}
      onRemoveVariation={handleRemoveVariation}
      onUpdateVariation={handleUpdateVariation}
      onSetPrimaryVariation={setPrimaryVariationIndex}
      onUpdateVariationPictures={handleUpdateVariationPictures}
      onUpdatePictures={setPictures}
      onConfirmVariations={onSaveVariations}
      onConfirmPictures={onSavePictures}
      onVideoChange={handleVideoChange}
      onConfirmVideo={onSaveVideo}
      supportsVideo={(adapter.capabilities.maxVideos ?? 0) > 0}
    />
  );
}
