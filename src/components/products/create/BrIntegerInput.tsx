import { Input } from "@/components/ui/input";
import { formatBrIntegerDisplay, parseBrIntegerDigits } from "@/utils/brNumericInput";

interface BrIntegerInputProps {
  id?: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

/** Integer with pt-BR thousands (ex.: 1.250 g). Stored value is digits only. */
export function BrIntegerInput({
  id,
  value,
  onChange,
  placeholder = "0",
  className = "",
  disabled,
  "aria-invalid": ariaInvalid,
}: BrIntegerInputProps) {
  const digits = parseBrIntegerDigits(value);
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-invalid={ariaInvalid}
      placeholder={placeholder}
      value={digits ? formatBrIntegerDisplay(digits) : ""}
      onChange={(e) => onChange(parseBrIntegerDigits(e.target.value))}
      className={className}
    />
  );
}
