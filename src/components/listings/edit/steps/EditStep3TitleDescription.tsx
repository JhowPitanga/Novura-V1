import { EditListingStepTitleDescription } from "@/components/listings/EditListingStepTitleDescription";
import type { MarketplaceAdapter } from "@/adapters/listings/types";

interface EditStep3TitleDescriptionProps {
  adapter: MarketplaceAdapter;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  soldQty: number;
  saving: string | null;
  onSaveTitle: () => Promise<void>;
  onSaveDescription: () => Promise<void>;
}

export function EditStep3TitleDescription({
  adapter,
  title,
  setTitle,
  description,
  setDescription,
  soldQty,
  saving,
  onSaveTitle,
  onSaveDescription,
}: EditStep3TitleDescriptionProps) {
  // Title is locked after first sale only for ML
  const canEditTitle = !(adapter.capabilities.titleLockedAfterFirstSale && soldQty > 0);

  return (
    <EditListingStepTitleDescription
      title={title}
      description={description}
      canEditTitle={canEditTitle}
      savingKey={saving}
      onTitleChange={setTitle}
      onDescriptionChange={setDescription}
      onConfirmTitle={onSaveTitle}
      onConfirmDescription={onSaveDescription}
    />
  );
}
