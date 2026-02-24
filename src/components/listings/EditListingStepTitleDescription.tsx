import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EditListingStepTitleDescriptionProps } from "./editListing.types";

/**
 * Title and description step for EditListingML. Purely presentational;
 * state and save actions are passed via props.
 */
export function EditListingStepTitleDescription({
  title,
  description,
  canEditTitle,
  savingKey,
  onTitleChange,
  onDescriptionChange,
  onConfirmTitle,
  onConfirmDescription,
}: EditListingStepTitleDescriptionProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center">
          <Label className="text-lg font-medium">Título</Label>
        </div>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Edite o título do anúncio"
          disabled={!canEditTitle}
        />
        {!canEditTitle && (
          <p className="text-sm text-muted-foreground">
            O título não pode ser alterado pois o anúncio já possui vendas.
          </p>
        )}
        <div>
          <Button
            size="sm"
            onClick={onConfirmTitle}
            disabled={savingKey === "title" || !canEditTitle}
          >
            {savingKey === "title" ? "Salvando..." : "Salvar Título"}
          </Button>
        </div>
      </div>
      <div className="space-y-4 pt-6 border-t">
        <div className="flex items-center">
          <Label className="text-lg font-medium">Descrição</Label>
        </div>
        <Textarea
          className="min-h-[200px]"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Descreva seu produto detalhadamente..."
        />
        <div>
          <Button
            size="sm"
            onClick={onConfirmDescription}
            disabled={savingKey === "description"}
          >
            {savingKey === "description" ? "Salvando..." : "Salvar Descrição"}
          </Button>
        </div>
      </div>
    </div>
  );
}
