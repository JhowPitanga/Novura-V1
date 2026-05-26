import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AdminPageErrorProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function AdminPageError({
  title = "Não foi possível carregar os dados",
  message,
  onRetry,
}: AdminPageErrorProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p className="text-sm">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
            <RefreshCw className="h-3 w-3 mr-1" />
            Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
