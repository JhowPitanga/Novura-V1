import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface OrderDrawerSectionProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
  trailing?: ReactNode;
}

/** Collapsible section card — matches Novura orders page style (rounded-3xl, white). */
export function OrderDrawerSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  trailing,
}: OrderDrawerSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Icon className="w-5 h-5 mr-2 text-purple-600 shrink-0" />
                {title}
                {trailing}
              </h3>
              {open ? (
                <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface OrderDrawerInfoRowProps {
  label: string;
  value: ReactNode;
}

export function OrderDrawerInfoRow({ label, value }: OrderDrawerInfoRowProps) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
      <span className="text-gray-600 text-sm">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right break-all">{value}</span>
    </div>
  );
}
