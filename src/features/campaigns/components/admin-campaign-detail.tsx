"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Pencil,
  Play,
  Pause,
  TrendingUp,
  Wallet,
  Eye,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { dateLabel, money, number, platformLabels } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { ErrorNotice, Loading } from "@/components/feedback";
import { ReviewQueue } from "@/features/submissions/components/review-queue";
import { DailyChart } from "@/features/metrics/daily-chart";
import { CampaignFormView } from "./campaign-form";

export function AdminCampaignDetail({ id }: { id: string }) {
  const trpc = useTRPC(),
    cache = useQueryClient(),
    [editing, setEditing] = useState(false);
  const query = useQuery(trpc.campaign.get.queryOptions({ id }));
  const overview = useQuery(
    trpc.campaign.overview.queryOptions({ campaignId: id }),
  );
  const refresh = () =>
    cache.invalidateQueries({ queryKey: trpc.campaign.pathKey() });
  const update = useMutation(
    trpc.campaign.update.mutationOptions({
      onSuccess: async () => {
        setEditing(false);
        await refresh();
      },
    }),
  );
  const status = useMutation(
    trpc.campaign.setStatus.mutationOptions({
      onSuccess: refresh,
      onError: refresh,
    }),
  );
  if (query.isPending) return <Loading label="Loading campaign…" />;
  if (query.error)
    return (
      <ErrorNotice
        message={query.error.message}
        retry={() => query.refetch()}
      />
    );
  const campaign = query.data;
  const metrics = overview.data;
  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/campaigns"
          className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All campaigns
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={campaign.status} />
              <span className="text-xs text-muted-foreground">
                {campaign.platforms
                  .map((platform) => platformLabels[platform])
                  .join(" · ")}
              </span>
            </div>
            <h1 className="text-3xl leading-tight font-semibold tracking-tight">
              {campaign.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span>
                {money(campaign.payoutPer1kViewsCents)} per 1,000 views
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {dateLabel(campaign.startsAt)} – {dateLabel(campaign.endsAt)}
              </span>
            </div>
            {Date.parse(campaign.endsAt) <= Date.now() && (
              <p className="mt-2 text-sm text-amber-800">
                This campaign has ended and no longer accepts new submissions or
                approvals.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {campaign.status !== "completed" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    update.reset();
                    setEditing(true);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  disabled={status.isPending}
                  onClick={() =>
                    status.mutate({
                      id,
                      expectedVersion: campaign.version,
                      status:
                        campaign.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {campaign.status === "active" ? (
                    <Pause aria-hidden="true" />
                  ) : (
                    <Play aria-hidden="true" />
                  )}
                  {status.isPending
                    ? "Updating…"
                    : campaign.status === "active"
                      ? "Pause"
                      : "Activate"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      {status.error && <ErrorNotice message={status.error.message} />}
      {overview.error ? (
        <ErrorNotice
          message={overview.error.message}
          retry={() => overview.refetch()}
        />
      ) : !metrics ? (
        <Loading label="Loading performance…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Approved views",
                value: number(metrics.totalApprovedViews),
                hint: "Latest counts across approved clips",
                Icon: Eye,
              },
              {
                label: "Budget spent",
                value: money(metrics.budgetAllocatedCents),
                hint: "Reserved for approved submissions",
                Icon: TrendingUp,
              },
              {
                label: "Budget left",
                value: money(metrics.budgetLeftCents),
                hint: `Of ${money(campaign.totalBudgetCents)} total budget`,
                Icon: Wallet,
              },
            ].map(({ label, value, hint, Icon }) => (
              <Card key={label} className="gap-3 py-5 shadow-none">
                <CardHeader className="flex-row items-center justify-between px-5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardHeader>
                <CardContent className="px-5">
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {value}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Daily views</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyChart data={metrics.dailyViews} />
            </CardContent>
          </Card>
        </>
      )}
      <ReviewQueue campaignId={id} />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit campaign</DialogTitle>
            <DialogDescription>
              Update campaign details. Existing creator terms remain protected.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <CampaignFormView
              key={`${id}:${campaign.version}`}
              initial={{
                title: campaign.title,
                platforms: campaign.platforms,
                payoutPer1kViewsCents: campaign.payoutPer1kViewsCents,
                totalBudgetCents: campaign.totalBudgetCents,
                startsAt: new Date(campaign.startsAt).toISOString(),
                endsAt: new Date(campaign.endsAt).toISOString(),
              }}
              termsLocked={campaign.termsLocked}
              saving={update.isPending}
              error={update.error?.message}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                await update
                  .mutateAsync({
                    ...values,
                    id,
                    expectedVersion: campaign.version,
                  })
                  .catch(() => undefined);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
