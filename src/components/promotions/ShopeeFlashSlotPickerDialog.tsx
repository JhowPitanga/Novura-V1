/**
 * Modal: calendar (left) + time slots for selected day (right). Shopee flash sale slot picker.
 */

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FlashSaleSlot } from "@/types/promotions";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatSlotTime(iso: string): string {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

function slotsForDay(slots: FlashSaleSlot[], day: Date | undefined): FlashSaleSlot[] {
  if (!day) return [];
  return slots.filter(s => sameLocalDay(new Date(s.startTime), day));
}

function criteriaSummary(c: FlashSaleSlot["criteria"]): string {
  if (!c) return "—";
  const parts: string[] = [];
  if (c.minStock != null || c.maxStock != null) {
    parts.push(`Estoque ${c.minStock ?? "—"}–${c.maxStock ?? "—"}`);
  }
  if (c.minPrice != null || c.maxPrice != null) {
    const min =
      c.minPrice != null
        ? c.minPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "—";
    const max =
      c.maxPrice != null
        ? c.maxPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "—";
    parts.push(`${min} – ${max}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export interface ShopeeFlashSlotPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: FlashSaleSlot[];
  selectedSlotId: string;
  onConfirm: (slotId: string) => void;
}

export function ShopeeFlashSlotPickerDialog({
  open,
  onOpenChange,
  slots,
  selectedSlotId,
  onConfirm,
}: ShopeeFlashSlotPickerDialogProps) {
  const [calendarDay, setCalendarDay] = useState<Date | undefined>(undefined);
  const [pendingSlotId, setPendingSlotId] = useState("");

  const daysWithOpenings = useMemo(() => {
    const seen = new Set<string>();
    const out: Date[] = [];
    for (const s of slots) {
      const d0 = startOfLocalDay(new Date(s.startTime));
      const key = `${d0.getFullYear()}-${d0.getMonth()}-${d0.getDate()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d0);
    }
    out.sort((a, b) => a.getTime() - b.getTime());
    return out;
  }, [slots]);

  const daySlots = useMemo(() => slotsForDay(slots, calendarDay), [slots, calendarDay]);

  useEffect(() => {
    if (!open) return;
    if (slots.length === 0) {
      setCalendarDay(undefined);
      setPendingSlotId("");
      return;
    }
    const fromSelected = selectedSlotId ? slots.find(s => s.slotId === selectedSlotId) : undefined;
    const sorted = [...slots].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    const initialDay = fromSelected
      ? startOfLocalDay(new Date(fromSelected.startTime))
      : startOfLocalDay(new Date(sorted[0].startTime));
    setCalendarDay(initialDay);
    const initialDaySlots = slotsForDay(slots, initialDay);
    const nextPending =
      fromSelected && initialDaySlots.some(s => s.slotId === fromSelected.slotId)
        ? fromSelected.slotId
        : initialDaySlots[0]?.slotId ?? "";
    setPendingSlotId(nextPending);
  }, [open, slots, selectedSlotId]);

  useEffect(() => {
    if (!open || !calendarDay) return;
    const ds = slotsForDay(slots, calendarDay);
    if (!ds.length) {
      if (pendingSlotId) setPendingSlotId("");
      return;
    }
    if (!ds.some(s => s.slotId === pendingSlotId)) {
      setPendingSlotId(ds[0].slotId);
    }
  }, [open, calendarDay, slots, pendingSlotId]);

  const handleConfirm = () => {
    if (!pendingSlotId) return;
    onConfirm(pendingSlotId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,44rem)] w-full gap-0 p-0 overflow-hidden sm:max-w-[min(96vw,44rem)]">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-left text-base pr-8">
            Selecione o período de tempo da oferta relâmpago
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:divide-x divide-border min-h-[320px] max-h-[min(70vh,480px)]">
          <div className="p-3 md:p-4 flex flex-col min-h-0">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Data</p>
            <div className="flex justify-center overflow-auto">
              <Calendar
                mode="single"
                selected={calendarDay}
                onSelect={d => d && setCalendarDay(startOfLocalDay(d))}
                locale={ptBR}
                initialFocus
                disabled={date => !daysWithOpenings.some(d => sameLocalDay(d, date))}
                modifiers={{ hasOpenings: daysWithOpenings }}
                modifiersClassNames={{
                  hasOpenings:
                    "font-semibold text-primary relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
                }}
                className="rounded-md border-0 p-2 [--cell-size:2.25rem]"
              />
            </div>
            <p className="text-[10px] text-center text-primary mt-2">Datas com ponto indicam aberturas disponíveis</p>
          </div>

          <div className="flex flex-col min-h-0 min-w-0 bg-muted/15">
            <div className="px-3 py-2 border-b bg-muted/40 grid grid-cols-[1fr_1fr] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Abertura</span>
              <span>Produtos</span>
            </div>
            <ScrollArea className="h-[260px] md:h-[min(320px,40vh)]">
              {daySlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center text-muted-foreground">
                  <CalendarIcon className="h-10 w-10 opacity-40" aria-hidden />
                  <p className="text-sm">Não há horários disponíveis para esta data selecionada.</p>
                </div>
              ) : (
                <ul className="p-2 space-y-1.5">
                  {daySlots.map(slot => {
                    const active = pendingSlotId === slot.slotId;
                    return (
                      <li key={slot.slotId}>
                        <button
                          type="button"
                          onClick={() => setPendingSlotId(slot.slotId)}
                          className={cn(
                            "w-full text-left rounded-lg border px-3 py-2.5 grid grid-cols-[1fr_1fr] gap-2 text-sm transition-colors",
                            active
                              ? "border-primary bg-primary/10 ring-1 ring-primary/25 shadow-sm"
                              : "border-transparent bg-white hover:border-primary/30 hover:bg-white",
                          )}
                        >
                          <span className="font-medium text-gray-900 leading-snug">
                            {formatSlotTime(slot.startTime)}
                            <span className="text-muted-foreground font-normal"> → </span>
                            <span className="font-medium">{format(new Date(slot.endTime), "HH:mm", { locale: ptBR })}</span>
                          </span>
                          <span className="text-xs text-muted-foreground leading-snug self-center">
                            {criteriaSummary(slot.criteria)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t bg-background gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!pendingSlotId}
            onClick={handleConfirm}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
