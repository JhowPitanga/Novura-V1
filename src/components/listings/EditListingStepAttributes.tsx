import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MultiValuedBadgeInput } from "@/components/listings/MultiValuedBadgeInput";
import { StringSuggestInput } from "@/components/listings/StringSuggestInput";
import type { EditListingStepAttributesProps } from "./editListing.types";

/**
 * Technical sheet (attributes) step for EditListingML. Renders required and
 * tech attributes with shared inputs; state and save via props.
 */
export function EditListingStepAttributes({
  filteredAttrs,
  attributes,
  showAllTechAttrs,
  loadingAttrs,
  savingKey,
  onToggleShowAllTechAttrs,
  onChangeAttribute,
  onConfirmAttributes,
}: EditListingStepAttributesProps) {
  const shownTech = showAllTechAttrs
    ? filteredAttrs.tech
    : filteredAttrs.tech.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Ficha Técnica</h3>
        <Button onClick={onConfirmAttributes} disabled={savingKey === "attributes"}>
          {savingKey === "attributes" ? "Salvando..." : "Salvar Ficha Técnica"}
        </Button>
      </div>
      {loadingAttrs ? (
        <div>Carregando atributos...</div>
      ) : (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="obrigatorios">
            <AccordionTrigger className="hover:no-underline">
              Atributos obrigatórios
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAttrs.required.map((meta: any) => {
                  const curr = attributes.find((a: any) => a.id === meta.id);
                  const isMulti = meta.tags?.multivalued;
                  const suggestions = (meta.values || []).map((v: any) => ({
                    id: v.id,
                    name: v.name,
                  }));
                  return (
                    <div key={meta.id}>
                      <Label>{meta.name}</Label>
                      {isMulti ? (
                        <MultiValuedBadgeInput
                          id={meta.id}
                          name={meta.name}
                          current={curr}
                          suggestions={suggestions}
                          onChange={(obj) =>
                            onChangeAttribute({
                              id: obj.id,
                              name: obj.name,
                              value_id: obj.value_id,
                              value_name: obj.value_name,
                            })
                          }
                        />
                      ) : (
                        <StringSuggestInput
                          id={meta.id}
                          name={meta.name}
                          current={curr}
                          suggestions={suggestions}
                          onChange={(obj) =>
                            onChangeAttribute({
                              id: obj.id,
                              name: obj.name,
                              value_id: obj.value_id,
                              value_name: obj.value_name,
                            })
                          }
                        />
                      )}
                    </div>
                  );
                })}
                <div className="md:col-span-2">
                  <Button
                    size="sm"
                    onClick={onConfirmAttributes}
                    disabled={savingKey === "attributes"}
                  >
                    {savingKey === "attributes" ? "Salvando..." : "Salvar Atributos"}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="caracteristicas">
            <AccordionTrigger className="hover:no-underline">
              Características
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shownTech.map((meta: any) => {
                  const curr = attributes.find((a: any) => a.id === meta.id);
                  const isMulti = meta.tags?.multivalued;
                  const suggestions = (meta.values || []).map((v: any) => ({
                    id: v.id,
                    name: v.name,
                  }));
                  return (
                    <div key={meta.id}>
                      <Label>{meta.name}</Label>
                      {isMulti ? (
                        <MultiValuedBadgeInput
                          id={meta.id}
                          name={meta.name}
                          current={curr}
                          suggestions={suggestions}
                          onChange={(obj) =>
                            onChangeAttribute({
                              id: obj.id,
                              name: obj.name,
                              value_id: obj.value_id,
                              value_name: obj.value_name,
                            })
                          }
                        />
                      ) : (
                        <StringSuggestInput
                          id={meta.id}
                          name={meta.name}
                          current={curr}
                          suggestions={suggestions}
                          onChange={(obj) =>
                            onChangeAttribute({
                              id: obj.id,
                              name: obj.name,
                              value_id: obj.value_id,
                              value_name: obj.value_name,
                            })
                          }
                        />
                      )}
                    </div>
                  );
                })}
                {filteredAttrs.tech.length > 5 && (
                  <Button
                    variant="link"
                    onClick={onToggleShowAllTechAttrs}
                  >
                    {showAllTechAttrs
                      ? "Mostrar menos"
                      : `Mostrar mais (${filteredAttrs.tech.length - 5} atributos)`}
                  </Button>
                )}
                <div className="md:col-span-2">
                  <Button
                    size="sm"
                    onClick={onConfirmAttributes}
                    disabled={savingKey === "attributes"}
                  >
                    {savingKey === "attributes" ? "Salvando..." : "Salvar Características"}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
