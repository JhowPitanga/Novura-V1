import { StepCategory } from '@/components/listings/StepCategory';
import { useCreateListingCategories } from '@/hooks/useCreateListingCategories';
import type { MarketplaceAdapter } from '@/adapters/listings/types';

interface Step2TitleCategoryProps {
  adapter: MarketplaceAdapter;
  organizationId: string;
  siteId: string;
  title: string;
  setTitle: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
}

/** Wraps StepCategory driving predictions/browsing through the adapter. */
export function Step2TitleCategory({
  adapter,
  organizationId,
  siteId,
  title,
  setTitle,
  categoryId,
  setCategoryId,
}: Step2TitleCategoryProps) {
  const categories = useCreateListingCategories({
    adapter,
    organizationId,
    siteId,
    title,
    categoryId,
    setCategoryId,
    currentStep: 2,
  });

  return (
    <StepCategory
      title={title}
      setTitle={setTitle}
      categoryId={categoryId}
      setCategoryId={setCategoryId}
      categorySuggestions={categories.categorySuggestions}
      domainSuggestions={categories.domainSuggestions}
      hasSearchedCategory={categories.hasSearchedCategory}
      isLoadingPredict={categories.isLoadingPredict}
      runPredict={categories.runPredict}
      pathsByCategoryId={categories.pathsByCategoryId}
      dumpOpen={categories.dumpOpen}
      setDumpOpen={categories.setDumpOpen}
      dumpQuery={categories.dumpQuery}
      setDumpQuery={categories.setDumpQuery}
      dumpLoading={categories.dumpLoading}
      dumpSelected={categories.dumpSelected}
      pendingCategoryId={categories.pendingCategoryId}
      pendingCategoryName={categories.pendingCategoryName}
      getColumnItems={categories.getColumnItems}
      handleSelectLevel={categories.handleSelectLevel}
      handleBreadcrumbClick={categories.handleBreadcrumbClick}
      confirmPickerCategory={categories.confirmPickerCategory}
      cancelPicker={categories.cancelPicker}
    />
  );
}
