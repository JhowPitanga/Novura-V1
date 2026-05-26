import { Button } from "@/components/ui/button";
import {
  EditListingAttributeField,
  splitAttrsByInputType,
} from "@/components/listings/edit/EditListingAttributeField";
import type { EditListingStepAttributesProps } from "./editListing.types";

function AttributeSection({
  title,
  description,
  metas,
  attributes,
  onChangeAttribute,
}: {
  title: string;
  description?: string;
  metas: any[];
  attributes: any[];
  onChangeAttribute: EditListingStepAttributesProps["onChangeAttribute"];
}) {
  if (!metas.length) return null;

  const { booleans, others } = splitAttrsByInputType(metas);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h4 className="text-base font-semibold text-novura-primary">{title}</h4>
        {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}
      </div>

      {others.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {others.map((meta) => {
            const id = String(meta?.id || "");
            const tags = meta?.tags || {};
            const isRequired = Array.isArray(tags)
              ? tags.includes("required")
              : !!tags?.required;
            const current = attributes.find((a: any) => String(a?.id) === id);
            return (
              <EditListingAttributeField
                key={id}
                meta={meta}
                current={current}
                isRequired={isRequired}
                onChange={onChangeAttribute}
              />
            );
          })}
        </div>
      )}

      {booleans.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Sim / Não
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {booleans.map((meta) => {
              const id = String(meta?.id || "");
              const tags = meta?.tags || {};
              const isRequired = Array.isArray(tags)
                ? tags.includes("required")
                : !!tags?.required;
              const current = attributes.find((a: any) => String(a?.id) === id);
              return (
                <EditListingAttributeField
                  key={id}
                  meta={meta}
                  current={current}
                  isRequired={isRequired}
                  onChange={onChangeAttribute}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function EditListingStepAttributes({
  marketplaceLabel,
  filteredAttrs,
  attributes,
  showAllTechAttrs,
  loadingAttrs,
  savingKey,
  onToggleShowAllTechAttrs,
  onChangeAttribute,
  onConfirmAttributes,
}: EditListingStepAttributesProps) {
  const techList = showAllTechAttrs
    ? filteredAttrs.tech
    : filteredAttrs.tech.slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Ficha técnica</h3>
          <p className="text-sm text-gray-500 mt-1">
            Campos da categoria no marketplace conectado, sem duplicar atributos entre seções.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-purple-100 text-novura-primary">
            {marketplaceLabel}
          </span>
          <Button onClick={onConfirmAttributes} disabled={savingKey === "attributes"}>
            {savingKey === "attributes" ? "Salvando..." : "Salvar ficha técnica"}
          </Button>
        </div>
      </div>

      {loadingAttrs ? (
        <div className="py-10 text-center text-sm text-gray-500">
          Carregando atributos da categoria...
        </div>
      ) : (
        <div className="space-y-5">
          {filteredAttrs.required.length === 0 && techList.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nenhum atributo disponível para esta categoria.
            </p>
          ) : null}

          <AttributeSection
            title="Atributos obrigatórios"
            description="Preencha todos os campos exigidos pela categoria."
            metas={filteredAttrs.required}
            attributes={attributes}
            onChangeAttribute={onChangeAttribute}
          />

          {(techList.length > 0 || filteredAttrs.tech.length > 12) && (
            <div className="space-y-3">
              {filteredAttrs.tech.length > 12 && (
                <div className="flex justify-end">
                  <Button
                    variant="link"
                    className="text-novura-primary p-0 h-auto"
                    onClick={onToggleShowAllTechAttrs}
                  >
                    {showAllTechAttrs
                      ? "Mostrar menos características"
                      : `Ver todas (${filteredAttrs.tech.length})`}
                  </Button>
                </div>
              )}
              <AttributeSection
                title="Características"
                description="Informações complementares do produto."
                metas={techList}
                attributes={attributes}
                onChangeAttribute={onChangeAttribute}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
