import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface StringSuggestInputProps {
  id: string;
  name: string;
  current: any;
  suggestions?: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (next: { id: string; name: string; value_id?: string; value_name?: string | null }) => void;
}

export function StringSuggestInput({ id, name, current, disabled, onChange }: StringSuggestInputProps) {
  const [val, setVal] = useState<string>(String(current?.value_name || ""));

  useEffect(() => {
    setVal(String(current?.value_name || ""));
  }, [current]);

  return (
    <Input
      className="mt-2"
      placeholder={name}
      disabled={disabled}
      value={val}
      onChange={(e) => {
        const v = e.target.value;
        setVal(v);
        onChange({ id, name, value_id: undefined, value_name: v });
      }}
    />
  );
}
