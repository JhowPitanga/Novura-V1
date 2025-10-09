
import { useKitData } from "./kit/useKitData";
import { useKitFormConversion } from "./kit/useKitFormConversion";
import { EditKitHeader } from "./kit/EditKitHeader";
import { EditKitLoading } from "./kit/EditKitLoading";
import { EditKitAccordion } from "./kit/EditKitAccordion";

export function EditKitWrapper() {
  const {
    loading,
    formData,
    handleInputChange,
    handleSave,
    selectedImages,
    setSelectedImages,
    kitEtapa,
    setKitEtapa,
    kitItems,
    setKitItems,
    navigate
  } = useKitData();

  const {
    formDataPT,
    kitItemsPT,
    handleInputChangePT,
    handleKitItemsChange
  } = useKitFormConversion(formData, kitItems);

  const handleVoltar = () => {
    navigate("/produtos");
  };

  const handleInputChangePTWrapper = (field: string, value: string) => {
    handleInputChangePT(field, value, handleInputChange);
  };

  const handleKitItemsChangeWrapper = (items: any[]) => {
    handleKitItemsChange(items, setKitItems);
  };

  if (loading) {
    return <EditKitLoading />;
  }

  return (
    <div className="space-y-6">
      <EditKitHeader
        productName={formData.name}
        sku={formData.sku}
        onBack={handleVoltar}
        onSave={handleSave}
      />

      <EditKitAccordion
        formData={formDataPT}
        onInputChange={handleInputChangePTWrapper}
        selectedImages={selectedImages}
        onImagesChange={setSelectedImages}
        kitEtapa={kitEtapa}
        onKitEtapaChange={setKitEtapa}
        kitItems={kitItemsPT}
        onKitItemsChange={handleKitItemsChangeWrapper}
      />
    </div>
  );
}
