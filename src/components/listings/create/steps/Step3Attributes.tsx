import { useMemo, useState } from 'react';
import { StepAttributes } from '@/components/listings/StepAttributes';
import { useCreateListingAttributes } from '@/hooks/useCreateListingAttributes';
import type { MarketplaceAdapter } from '@/adapters/listings/types';

interface Step3AttributesProps {
  adapter: MarketplaceAdapter;
  attrsMeta: any[];
  conditionalRequiredIds: string[];
  techSpecsInput: any;
  attributes: any[];
  setAttributes: (v: any[]) => void;
  pictures: (string | File)[];
  setPictures: (v: string[]) => void;
  video: File | string | null;
  setVideo: (v: File | string | null) => void;
  description: string;
  setDescription: (v: string) => void;
  loadingAttrs: boolean;
}

export function Step3Attributes({
  adapter,
  attrsMeta,
  conditionalRequiredIds,
  techSpecsInput,
  attributes,
  setAttributes,
  pictures,
  setPictures,
  video,
  setVideo,
  description,
  setDescription,
  loadingAttrs,
}: Step3AttributesProps) {
  const isShopeeMode = adapter.channel === 'shopee';
  const [fashionImage34, setFashionImage34] = useState(false);

  const { filteredAttrs } = useCreateListingAttributes({
    attrsMeta,
    conditionalRequiredIds,
    techSpecsInput,
  });

  const pictureUrls = useMemo(
    () =>
      pictures.map((p) => {
        if (typeof p === 'string') return p;
        if (p instanceof File) {
          try {
            return URL.createObjectURL(p);
          } catch {
            return '';
          }
        }
        return '';
      }).filter(Boolean),
    [pictures],
  );

  return (
    <StepAttributes
      isShopeeMode={isShopeeMode}
      pictures={pictureUrls}
      setPictures={setPictures}
      fashionImage34={fashionImage34}
      setFashionImage34={setFashionImage34}
      filteredAttrs={filteredAttrs}
      attributes={attributes}
      setAttributes={setAttributes}
      description={description}
      setDescription={setDescription}
      loadingAttrs={loadingAttrs}
      video={video}
      setVideo={setVideo}
    />
  );
}
