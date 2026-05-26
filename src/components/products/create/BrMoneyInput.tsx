import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatBrDecimalDisplay, parseBrlMoneyToCanonical } from "@/utils/brNumericInput";

interface BrMoneyInputProps {
  id?: string;
  value: string;
  onChange: (canonical: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

function formatValueProp(value: string | undefined): string {
  if (value === "" || value === undefined || value === null) return "";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  return formatBrDecimalDisplay(rounded.toFixed(2), 2);
}

/**
 * Currency-style input for BRL: comma as decimal separator, dot as thousands;
 * stored value is a decimal string with dot (e.g. "25.90") for parseFloat.
 */
export function BrMoneyInput({
  id,
  value,
  onChange,
  placeholder = "0,00",
  className = "",
  disabled,
  "aria-invalid": ariaInvalid,
}: BrMoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const displayValue = focused && draft !== null ? draft : formatValueProp(value);

  useEffect(() => {
    if (!focused) setDraft(null);
  }, [focused, value]);

  const handleFocus = () => {
    setFocused(true);
    setDraft(formatValueProp(value) || "");
  };

  const handleBlur = () => {
    if (value !== "" && value !== undefined) {
      const n = parseFloat(String(value));
      if (!Number.isNaN(n)) onChange((Math.round(n * 100) / 100).toFixed(2));
    }
    setFocused(false);
    setDraft(null);
  };

  const handleChange = (raw: string) => {
    if (raw.trim() === "") {
      setDraft("");
      onChange("");
      return;
    }

    const lastComma = raw.lastIndexOf(",");
    const afterComma = lastComma >= 0 ? raw.slice(lastComma + 1) : "";
    const hasPendingDecimal = lastComma >= 0 && afterComma.replace(/\D/g, "").length === 0;

    if (hasPendingDecimal) {
      const canonical = parseBrlMoneyToCanonical(raw);
      if (canonical !== "") onChange(canonical);
      else onChange("");
      setDraft(raw.replace(/[^\d.,]/g, ""));
      return;
    }

    const canonical = parseBrlMoneyToCanonical(raw);
    if (canonical === "") {
      setDraft(raw.replace(/[^\d.,\s]/g, ""));
      return;
    }

    const n = parseFloat(canonical);
    const fixed = (Math.round(n * 100) / 100).toFixed(2);
    onChange(fixed);
    setDraft(raw.replace(/[^\d.,]/g, ""));
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      aria-invalid={ariaInvalid}
      placeholder={placeholder}
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(e) => handleChange(e.target.value)}
      className={className}
    />
  );
}

/** Read-only style display (e.g. summary lines) */
export function formatMoneyPtBr(value: string | number): string {
  const s = typeof value === "number" ? String(value) : String(value || "");
  if (!s) return "—";
  const n = parseFloat(s);
  if (Number.isNaN(n)) return "—";
  return formatBrDecimalDisplay(String(n), 2);
}
