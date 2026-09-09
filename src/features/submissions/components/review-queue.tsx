"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, ExternalLink, RefreshCw } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { money, number, platformLabels } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorNotice,
  FieldError,
  Loading,
} from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { rejectionSchema } from "../schemas";

function RejectDialog({
  submissionId,
  onClose,
  onSaved,
}: {
  submissionId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const form = useForm<z.infer<typeof rejectionSchema>>({
    resolver: zodResolver(rejectionSchema),
    defaultValues: { submissionId, reason: "" },
  });
  const reject = useMutation(
    trpc.submission.reject.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        onClose();
      },
    }),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject submission</DialogTitle>
          <DialogDescription>
            Let the creator know why this clip does not meet the campaign
            requirements.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            await reject.mutateAsync(values).catch(() => undefined);
          })}
          noValidate
        >
          {reject.error && <ErrorNotice message={reject.error.message} />}
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Reason</Label>
            <Textarea
              id="rejection-reason"
              rows={4}
              placeholder="Give the creator a clear, helpful reason…"
              {...form.register("reason")}
              aria-invalid={!!form.formState.errors.reason}
              aria-describedby="reason-error"
              maxLength={1000}
            />
            <FieldError
              id="reason-error"
              message={form.formState.errors.reason?.message}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={reject.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="submit"
              disabled={reject.isPending}
            >
              {reject.isPending ? "Rejecting…" : "Reject submission"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewQueue({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [rejectId, setRejectId] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const query = useQuery(
    trpc.submission.reviewQueue.queryOptions({ campaignId, page, pageSize: 6 }),
  );
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: trpc.campaign.pathKey() }),
      cache.invalidateQueries({ queryKey: trpc.submission.pathKey() }),
    ]);
  };
  const approve = useMutation(
    trpc.submission.approve.mutationOptions({
      onSuccess: async () => {
        setNotice("Submission approved. The campaign budget is up to date.");
        await refresh();
      },
      onError: async () => {
        setNotice("");
        await refresh();
      },
    }),
  );
  const budgetError = approve.error?.data?.domainError;
  const message =
    budgetError?.code === "INSUFFICIENT_BUDGET"
      ? `This approval needs ${money(budgetError.requiredCents)}, but only ${money(budgetError.availableCents)} remains. The submission is still pending.`
      : approve.error?.message;
  return (
    <section className="space-y-4" aria-labelledby="review-heading">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="review-heading" className="text-lg font-semibold">
            Review queue{" "}
            {query.data && (
              <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {query.data.totalItems}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending clips, oldest first. Approvals reserve the current earnings.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={query.isFetching}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>
      {message && <ErrorNotice message={message} />}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {query.isPending ? (
        <Loading label="Loading review queue…" />
      ) : query.error ? (
        <ErrorNotice
          message={query.error.message}
          retry={() => query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="All caught up">
          There are no pending clips on this page. New submissions will appear
          here.
        </EmptyState>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Submission</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Approval cost</TableHead>
                <TableHead className="pr-5 text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((clip) => (
                <TableRow key={clip.id}>
                  <TableCell className="py-5 pl-5">
                    <p className="text-sm font-medium">{clip.creatorEmail}</p>
                    <a
                      href={clip.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
                    >
                      {platformLabels[clip.platform]} post
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(clip.latestViews)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {money(clip.estimatedEarningsCents)}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => {
                          setNotice("");
                          approve.reset();
                          setRejectId(clip.id);
                        }}
                      >
                        Reject
                        <span className="sr-only">
                          {" "}
                          {clip.creatorEmail}&apos;s submission
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => {
                          setNotice("");
                          approve.mutate({ submissionId: clip.id });
                        }}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        {approve.isPending &&
                        approve.variables?.submissionId === clip.id
                          ? "Approving…"
                          : "Approve"}
                        <span className="sr-only">
                          {" "}
                          {clip.creatorEmail}&apos;s submission
                        </span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data && (
        <Pagination
          {...query.data}
          onChange={setPage}
          disabled={query.isFetching || approve.isPending}
        />
      )}
      {rejectId && (
        <RejectDialog
          submissionId={rejectId}
          onClose={() => setRejectId(null)}
          onSaved={async () => {
            setNotice("Submission rejected. The creator can see your reason.");
            await refresh();
          }}
        />
      )}
    </section>
  );
}
