import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface AdminMetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "danger";
  delta?: string;
}

export function AdminMetricCard({ label, value, icon: Icon, variant = "default", delta }: AdminMetricCardProps) {
  return (
    <Card className="bg-white shadow-sm border-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {label}
            </p>
            <p className={`text-2xl font-bold ${variant === "danger" ? "text-destructive" : "text-gray-900"}`}>
              {value}
            </p>
            {delta && (
              <p className="text-xs text-muted-foreground mt-1">{delta}</p>
            )}
          </div>
          <div className={`p-2 rounded-lg ${variant === "danger" ? "bg-destructive/10" : "bg-primary/10"}`}>
            <Icon className={`h-5 w-5 ${variant === "danger" ? "text-destructive" : "text-novura-primary"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
