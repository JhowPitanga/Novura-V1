import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface MultiValuedBadgeInputProps {
  id: string;
  name: string;
  current: any;
  suggestions?: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (next: { id: string; name: string; value_id?: string; value_name?: string | null }) => void;
}

export function MultiValuedBadgeInput({ id, name, current, disabled, onChange }: MultiValuedBadgeInputProps) {
  const initial = String(current?.value_name || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const [tokens, setTokens] = useState<{ id?: string; name: string }[]>(initial.map((n) => ({ name: n })));
  const [input, setInput] = useState("");

  useEffect(() => {
    const curr = String(current?.value_name || "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    setTokens(curr.map((n) => ({ name: n })));
  }, [current]);

  const commitTokens = (list: { id?: string; name: string }[]) => {
    const joined = list.map((t) => t.name).join(", ");
    onChange({ id, name, value_id: undefined, value_name: joined || null });
  };

  const addToken = (t: { id?: string; name: string }) => {
    if (disabled) return;
    const next = [...tokens, t];
    setTokens(next);
    commitTokens(next);
    setInput("");
  };

  const removeAt = (idx: number) => {
    if (disabled) return;
    const next = tokens.filter((_, i) => i !== idx);
    setTokens(next);
    commitTokens(next);
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2 mb-2">
        {tokens.map((t, idx) => (
          <Badge key={`${t.name}-${idx}`} variant="outline" className="flex items-center gap-1">
            <span>{t.name}</span>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              disabled={disabled}
              className="ml-1 inline-flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder={name}
        disabled={disabled}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            const v = String(input || "").replace(/,/g, "").trim();
            if (v) addToken({ name: v });
            e.preventDefault();
          }
        }}
      />
    </div>
  );
}
