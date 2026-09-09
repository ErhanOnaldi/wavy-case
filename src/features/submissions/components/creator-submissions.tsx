"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { money, number, platformLabels } from "@/lib/format";
import { submissionStatuses } from "@/features/shared";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, ErrorNotice, Loading } from "@/components/feedback";
import { Pagination } from "@/components/pagination";

export function CreatorSubmissions() {
  const trpc = useTRPC(),
    [page, setPage] = useState(1);
  const [status, setStatus] = useState<
    (typeof submissionStatuses)[number] | "all"
  >("all");
  const query = useQuery(
    trpc.submission.listMine.queryOptions({
      page,
      pageSize: 6,
      status: status === "all" ? undefined : status,
    }),
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">YOUR CLIPS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            My submissions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Follow each clip from review to rewards.
          </p>
        </div>
        <div className="flex gap-2">
          <label htmlFor="submission-status" className="sr-only">
            Filter submission status
          </label>
          <select
            id="submission-status"
            className="native-select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {submissionStatuses.map((item) => (
              <option key={item} value={item}>
                {item[0].toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh submissions"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <Loading label="Loading your submissions…" />
      ) : query.error ? (
        <ErrorNotice
          message={query.error.message}
          retry={() => query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="No submissions here yet">
          Browse an active campaign and share your first clip.{" "}
          <Link
            href="/campaigns"
            className="font-medium text-primary underline"
          >
            Explore campaigns
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {query.data.items.map((clip) => (
            <article
              key={clip.id}
              className="rounded-xl border bg-card p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <StatusBadge status={clip.status} />
                    <span className="text-xs text-muted-foreground">
                      {platformLabels[clip.platform]}
                    </span>
                  </div>
                  <h2 className="font-semibold">{clip.campaignTitle}</h2>
                  <a
                    href={clip.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
                  >
                    Open original post
                    <ExternalLink className="size-3" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
                <dl className="grid grid-cols-3 gap-5 sm:gap-8">
                  <div>
                    <dt className="text-xs text-muted-foreground">Views</dt>
                    <dd className="mt-2 text-lg font-semibold tabular-nums">
                      {number(clip.latestViews)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {clip.status === "pending" ? "If approved" : "Estimated"}
                    </dt>
                    <dd className="mt-2 text-lg font-semibold tabular-nums">
                      {money(clip.estimatedEarningsCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reserved</dt>
                    <dd className="mt-2 text-lg font-semibold text-primary tabular-nums">
                      {money(clip.allocatedEarningsCents)}
                    </dd>
                  </div>
                </dl>
              </div>
              {clip.rejectionReason && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">
                  <strong className="font-medium">Review feedback:</strong>{" "}
                  {clip.rejectionReason}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      {query.data && (
        <Pagination
          {...query.data}
          onChange={setPage}
          disabled={query.isFetching}
        />
      )}
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
        Estimates use the latest view count and full blocks of 1,000 views.
        Reserved earnings are limited by the campaign budget. Views are
        simulated in this demo.
      </p>
    </div>
  );
}
