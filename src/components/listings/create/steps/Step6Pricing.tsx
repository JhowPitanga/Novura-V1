import { StepPricing } from '@/components/listings/StepPricing';

interface Step6PricingProps {
  price: string;
  setPrice: (v: string) => void;
  listingTypeId: string;
  setListingTypeId: (v: string) => void;
  listingTypes: any[];
  listingPriceOptions: any[];
  saleTermsMeta: any[];
  saleTerms: any[];
  setSaleTerms: (v: any[]) => void;
  currencyId: string;
  loadingListing: boolean;
}

export function Step6Pricing({
  price,
  setPrice,
  listingTypeId,
  setListingTypeId,
  listingTypes,
  listingPriceOptions,
  saleTermsMeta,
  saleTerms,
  setSaleTerms,
  currencyId,
  loadingListing,
}: Step6PricingProps) {
  return (
    <StepPricing
      price={price}
      setPrice={setPrice}
      listingTypeId={listingTypeId}
      setListingTypeId={setListingTypeId}
      listingTypes={listingTypes}
      listingPriceOptions={listingPriceOptions}
      loadingListing={loadingListing}
      saleTermsMeta={saleTermsMeta}
      saleTerms={saleTerms}
      setSaleTerms={setSaleTerms}
      currencyId={currencyId}
    />
  );
}
