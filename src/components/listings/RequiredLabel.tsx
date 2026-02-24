import { Label } from "@/components/ui/label";

export function RequiredLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Label>{text}</Label>
      {required ? (
        <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">
          Obrigatório
        </span>
      ) : null}
    </div>
  );
}
