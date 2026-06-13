import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared load-failure state for data-backed screens. Without this, a failed
 * useApiQuery leaves `data` undefined and the page spins forever (the spinner
 * and the error case were indistinguishable). Render this when `error && !data`.
 */
export function QueryError({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center ${className ?? ""}`}>
      <TriangleAlert className="size-7 text-je-error" />
      <div>
        <p className="text-[14px] font-medium">Couldn't load this data</p>
        <p className="mt-1 max-w-sm text-[12px] text-je-ink-2">
          {message || "The request failed — check your connection and try again."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="rounded-none" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
