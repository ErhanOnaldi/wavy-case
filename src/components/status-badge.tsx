import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const colors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  draft: "border-slate-200 bg-slate-100 text-slate-600",
  completed: "border-sky-200 bg-sky-50 text-sky-800",
  paid: "border-sky-200 bg-sky-50 text-sky-800",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 capitalize", colors[status])}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </Badge>
  );
}
