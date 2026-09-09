import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  totalPages,
  totalItems,
  onChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-5 text-sm text-muted-foreground">
      <span>
        {totalItems} {totalItems === 1 ? "result" : "results"}
      </span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
