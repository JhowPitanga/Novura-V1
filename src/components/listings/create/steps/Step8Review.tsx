import { StepReview } from '@/components/listings/StepReview';

interface Step8ReviewProps {
  title: string;
  setTitle: (v: string) => void;
  listingTypeId: string;
  listingTypes: any[];
  selectedLogisticType: string;
  categoryPath: string;
  variations: any[];
  pictures: (string | File)[];
  onBack: () => void;
  onPublish: () => void;
}

export function Step8Review({
  title,
  setTitle,
  listingTypeId,
  listingTypes,
  selectedLogisticType,
  categoryPath,
  variations,
  pictures,
  onBack,
  onPublish,
}: Step8ReviewProps) {
  const pictureUrls = pictures.map((p) => {
    if (typeof p === 'string') return p;
    if (p instanceof File) {
      try {
        return URL.createObjectURL(p);
      } catch {
        return '';
      }
    }
    return '';
  }).filter(Boolean);

  return (
    <StepReview
      title={title}
      setTitle={setTitle}
      listingTypeId={listingTypeId}
      listingTypes={listingTypes}
      selectedLogisticType={selectedLogisticType}
      categoryPath={categoryPath}
      variations={variations}
      pictures={pictureUrls}
      onBack={onBack}
      onPublish={onPublish}
    />
  );
}
