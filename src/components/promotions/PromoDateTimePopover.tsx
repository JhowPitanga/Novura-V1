/**
 * Date + scrollable time columns for promotion scheduling.
 * Uses the shared Calendar (DayPicker) and primary (purple) accents.
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local datetime string compatible with `new Date()` parsing (YYYY-MM-DDTHH:mm). */
export function toLocalDatetimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseLocalDatetimeValue(s: string): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

interface TimeScrollColumnProps {
  values: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
  "aria-label": string;
}

function TimeScrollColumn({ values, selected, onSelect, "aria-label": ariaLabel }: TimeScrollColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-time-value="${selected}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [selected, values]);

  return (
    <div className="flex flex-col items-center w-11 shrink-0 select-none">
      <ChevronUp className="h-3 w-3 text-muted-foreground opacity-50 mb-0.5" aria-hidden />
      <div
        ref={scrollRef}
        className="h-[200px] w-full overflow-y-auto overflow-x-hidden scroll-smooth py-10 [scrollbar-width:thin]"
        role="listbox"
        aria-label={ariaLabel}
      >
        {values.map(v => {
          const isSel = v === selected;
          return (
            <button
              key={v}
              type="button"
              data-time-value={v}
              role="option"
              aria-selected={isSel}
              className={cn(
                "w-full h-8 text-sm flex items-center justify-center rounded-md transition-colors shrink-0",
                isSel
                  ? "text-primary font-semibold bg-primary/12 ring-1 ring-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              onClick={() => onSelect(v)}
            >
              {v}
            </button>
          );
        })}
      </div>
      <ChevronDown className="h-3 w-3 text-muted-foreground opacity-50 mt-0.5" aria-hidden />
    </div>
  );
}

export interface PromoDateTimeFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id?: string;
}

export function PromoDateTimeField({ label, value, onChange, id }: PromoDateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date | undefined>(undefined);
  const [hour, setHour] = useState("09");
  const [minute, setMinute] = useState("00");

  useEffect(() => {
    if (!open) return;
    const d = parseLocalDatetimeValue(value);
    if (d) {
      setTempDate(d);
      setHour(pad2(d.getHours()));
      setMinute(pad2(d.getMinutes()));
    } else {
      setTempDate(undefined);
      setHour("09");
      setMinute("00");
    }
  }, [open, value]);

  const displayLabel = useMemo(() => {
    if (!value) return null;
    const d = parseLocalDatetimeValue(value);
    if (!d) return null;
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }, [value]);

  const apply = () => {
    if (!tempDate) {
      setOpen(false);
      return;
    }
    const hh = parseInt(hour, 10);
    const mm = parseInt(minute, 10);
    const next = new Date(tempDate);
    next.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
    onChange(toLocalDatetimeValue(next));
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            className={cn(
              "w-full justify-start h-11 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-4 w-4 mr-2 shrink-0 text-primary" />
            <span className="truncate tabular-nums">{displayLabel ?? "dd/mm/aaaa hh:mm"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 overflow-hidden shadow-lg" align="start">
          <div className="flex flex-row divide-x divide-border">
            <div className="p-0">
              <Calendar
                mode="single"
                selected={tempDate}
                onSelect={d => setTempDate(d)}
                locale={ptBR}
                initialFocus
                className="rounded-none border-0"
              />
            </div>
            <div
              className="relative flex flex-row items-center justify-center gap-0.5 px-2 py-2 bg-muted/20 min-w-[7.5rem]"
              aria-label="Hora"
            >
              <div
                className="pointer-events-none absolute left-1.5 right-1.5 top-1/2 z-10 h-8 -translate-y-1/2 border-y border-primary/30 rounded-sm"
                aria-hidden
              />
              <TimeScrollColumn values={HOURS} selected={hour} onSelect={setHour} aria-label="Horas" />
              <span className="text-primary font-semibold text-lg leading-none pt-1 z-20" aria-hidden>
                :
              </span>
              <TimeScrollColumn values={MINUTES} selected={minute} onSelect={setMinute} aria-label="Minutos" />
            </div>
          </div>
          <div className="p-2 border-t flex justify-end gap-2 bg-popover">
            <Button type="button" variant="ghost" className="text-muted-foreground" onClick={clear}>
              Remover
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[100px]"
              onClick={apply}
              disabled={!tempDate}
            >
              Confirmar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
