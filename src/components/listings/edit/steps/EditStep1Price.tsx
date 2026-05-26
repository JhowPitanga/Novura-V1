import { EditListingStepPrice } from "@/components/listings/EditListingStepPrice";
import type { MarketplaceAdapter, ListingType, ListingPriceOption } from "@/adapters/listings/types";

interface EditStep1PriceProps {
  adapter: MarketplaceAdapter;
  price: string;
  setPrice: (v: string) => void;
  listingTypeId: string;
  setListingTypeId: (v: string) => void;
  listingTypes: ListingType[];
  listingPriceOptions: ListingPriceOption[];
  loadingListing: boolean;
  saving: string | null;
  priceEditable: boolean;
  itemRow: any;
  onSavePrice: () => Promise<void>;
  onSaveListingType: () => Promise<void>;
}

export function EditStep1Price({
  adapter,
  price,
  setPrice,
  listingTypeId,
  setListingTypeId,
  listingTypes,
  listingPriceOptions,
  loadingListing,
  saving,
  priceEditable,
  itemRow,
  onSavePrice,
  onSaveListingType,
}: EditStep1PriceProps) {
  const showListingTypes = adapter.capabilities.supportsListingTypes;

  return (
    <EditListingStepPrice
      price={price}
      priceEditable={priceEditable}
      savingKey={saving}
      loadingListing={loadingListing}
      showListingTypes={showListingTypes}
      marketplaceLabel={adapter.displayName}
      listingTypes={showListingTypes ? listingTypes : []}
      listingTypeId={listingTypeId}
      listingPriceOptions={listingPriceOptions}
      itemRow={itemRow}
      onPriceChange={setPrice}
      onConfirmPrice={onSavePrice}
      onListingTypeChange={setListingTypeId}
      onConfirmListingType={onSaveListingType}
    />
  );
}
