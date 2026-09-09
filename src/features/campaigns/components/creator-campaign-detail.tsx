"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowLeft, ArrowRight, Link2 } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { dateLabel, money, platformLabels } from "@/lib/format";
import { submissionFormSchema } from "@/features/submissions/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { ErrorNotice, FieldError, Loading } from "@/components/feedback";

export function CreatorCampaignDetail({ id }: { id: string }) {
  const trpc = useTRPC(),
    router = useRouter(),
    cache = useQueryClient();
  const query = useQuery(trpc.campaign.getAvailable.queryOptions({ id }));
  const form = useForm<z.infer<typeof submissionFormSchema>>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: { campaignId: id, postUrl: "" },
  });
  const create = useMutation(
    trpc.submission.create.mutationOptions({
      onSuccess: async () => {
        await cache.invalidateQueries({ queryKey: trpc.submission.pathKey() });
        router.push("/my-submissions");
      },
      onError: (error) => {
        if (error.data?.domainError?.code === "DUPLICATE_SUBMISSION")
          form.setError("postUrl", { message: error.message });
      },
    }),
  );
  if (query.isPending) return <Loading label="Loading campaign…" />;
  if (query.error)
    return (
      <div className="space-y-5">
        <Link href="/campaigns" className="text-sm text-primary underline">
          Back to campaigns
        </Link>
        <ErrorNotice
          message={query.error.message}
          retry={() => query.refetch()}
        />
      </div>
    );
  const campaign = query.data;
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/campaigns"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All campaigns
      </Link>
      <div className="rounded-xl border bg-card p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={campaign.status} />
          <span className="text-sm text-muted-foreground">
            {campaign.platforms
              .map((platform) => platformLabels[platform])
              .join(" · ")}
          </span>
        </div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">
          {campaign.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {dateLabel(campaign.startsAt)} – {dateLabel(campaign.endsAt)}
        </p>
        <div className="my-8 grid grid-cols-2 gap-5 rounded-lg bg-muted p-5">
          <div>
            <p className="text-xs text-muted-foreground">Per 1,000 views</p>
            <p className="mt-2 text-2xl font-semibold">
              {money(campaign.payoutPer1kViewsCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Budget available</p>
            <p className="mt-2 text-2xl font-semibold">
              {money(campaign.totalBudgetCents - campaign.budgetAllocatedCents)}
            </p>
          </div>
        </div>
        <h2 className="text-lg font-semibold">Submit your clip</h2>
        <p className="mt-2 mb-5 text-sm leading-6 text-muted-foreground">
          Share a post from one of the supported platforms. An admin will review
          your submission before earnings are reserved.
        </p>
        <form
          className="space-y-5"
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            await create.mutateAsync(values).catch(() => undefined);
          })}
        >
          {create.error && <ErrorNotice message={create.error.message} />}
          <div className="space-y-2">
            <Label htmlFor="post-url">Post URL</Label>
            <div className="relative">
              <Link2
                className="absolute top-2.5 left-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="post-url"
                type="url"
                placeholder="https://www.youtube.com/shorts/…"
                className="pl-9"
                {...form.register("postUrl")}
                aria-invalid={!!form.formState.errors.postUrl}
                aria-describedby="post-url-error post-url-hint"
              />
            </div>
            <FieldError
              id="post-url-error"
              message={form.formState.errors.postUrl?.message}
            />
            <p
              id="post-url-hint"
              className="text-xs leading-5 text-muted-foreground"
            >
              Use a direct post URL. Each post can only be submitted once per
              campaign.
            </p>
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Submitting…" : "Submit for review"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>
        <p className="mt-6 border-t pt-5 text-xs leading-5 text-muted-foreground">
          Rewards are calculated per full 1,000 views and subject to the
          remaining campaign budget. Initial views and daily updates are
          simulated for this demo.
        </p>
      </div>
    </div>
  );
}
