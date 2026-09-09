"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Plus, Search } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { money, dateLabel, platformLabels } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, ErrorNotice, Loading } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { campaignStatuses } from "@/features/shared";

export function AdminCampaignList() {
  const trpc = useTRPC();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [draftSearch, setDraftSearch] = useState("");
  const [status, setStatus] = useState<
    (typeof campaignStatuses)[number] | "all"
  >("all");
  const query = useQuery(
    trpc.campaign.list.queryOptions({
      page,
      pageSize: 6,
      search: search || undefined,
      status: status === "all" ? undefined : status,
    }),
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">ADMIN WORKSPACE</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Campaigns
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your campaigns, review clips, and keep an eye on the budget.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/campaigns/new">
            <Plus aria-hidden="true" />
            New campaign
          </Link>
        </Button>
      </div>
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(draftSearch.trim());
              setPage(1);
            }}
          >
            <label htmlFor="campaign-search" className="sr-only">
              Search campaigns by title
            </label>
            <Input
              id="campaign-search"
              type="search"
              placeholder="Search campaigns…"
              className="max-w-sm"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              aria-label="Search campaigns"
            >
              <Search aria-hidden="true" />
            </Button>
          </form>
          <label htmlFor="campaign-status" className="sr-only">
            Filter campaign status
          </label>
          <select
            id="campaign-status"
            className="native-select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {campaignStatuses.map((item) => (
              <option key={item} value={item}>
                {item[0].toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
        </div>
        {query.isPending ? (
          <Loading label="Loading campaigns…" />
        ) : query.error ? (
          <div className="p-5">
            <ErrorNotice
              message={query.error.message}
              retry={() => query.refetch()}
            />
          </div>
        ) : query.data.items.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No campaigns found">
              Try a different search or create your first campaign.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Per 1,000 views</TableHead>
                <TableHead className="text-right">Budget left</TableHead>
                <TableHead className="pr-5 text-right">Ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="max-w-80 py-5 pl-5">
                    <Link
                      href={`/admin/campaigns/${campaign.id}`}
                      className="font-medium hover:underline"
                    >
                      {campaign.title}
                    </Link>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {campaign.platforms
                        .map((platform) => platformLabels[platform])
                        .join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(campaign.payoutPer1kViewsCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="font-medium">
                      {money(
                        campaign.totalBudgetCents -
                          campaign.budgetAllocatedCents,
                      )}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      of {money(campaign.totalBudgetCents)}
                    </p>
                  </TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">
                    {dateLabel(campaign.endsAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {query.data && (
        <Pagination
          {...query.data}
          onChange={setPage}
          disabled={query.isFetching}
        />
      )}
    </div>
  );
}

export function CreatorCampaignList() {
  const trpc = useTRPC(),
    [page, setPage] = useState(1);
  const query = useQuery(
    trpc.campaign.browse.queryOptions({ page, pageSize: 6 }),
  );
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">CREATOR WORKSPACE</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Find your next campaign
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a campaign, share your clip, and earn for every 1,000 views.
        </p>
      </div>
      {query.isPending ? (
        <Loading label="Finding active campaigns…" />
      ) : query.error ? (
        <ErrorNotice
          message={query.error.message}
          retry={() => query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="No active campaigns right now">
          Check back soon for your next opportunity.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.items.map((campaign) => (
            <article
              key={campaign.id}
              className="flex flex-col rounded-xl border bg-card p-6 transition-shadow hover:shadow-sm"
            >
              <div className="mb-5 flex items-center justify-between">
                <StatusBadge status={campaign.status} />
                <span className="text-xs text-muted-foreground">
                  {campaign.platforms
                    .map((platform) => platformLabels[platform])
                    .join(" / ")}
                </span>
              </div>
              <h2 className="mb-6 min-h-14 text-lg leading-7 font-semibold tracking-tight">
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="hover:underline"
                >
                  {campaign.title}
                </Link>
              </h2>
              <div className="mt-auto flex justify-between border-t pt-5">
                <div>
                  <p className="text-2xl font-semibold tracking-tight">
                    {money(campaign.payoutPer1kViewsCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    per 1,000 views
                  </p>
                </div>
                <div className="text-right">
                  <p className="pt-1 text-base font-medium">
                    {money(
                      campaign.totalBudgetCents - campaign.budgetAllocatedCents,
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    budget available
                  </p>
                </div>
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Ends {dateLabel(campaign.endsAt)}
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-5 w-full justify-between"
              >
                <Link href={`/campaigns/${campaign.id}`}>
                  View campaign
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
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
    </div>
  );
}
