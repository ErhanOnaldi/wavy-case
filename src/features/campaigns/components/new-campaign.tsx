"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { CampaignFormView } from "./campaign-form";

export function NewCampaign() {
  const trpc = useTRPC(),
    router = useRouter(),
    cache = useQueryClient();
  const create = useMutation(
    trpc.campaign.create.mutationOptions({
      onSuccess: async (result) => {
        await cache.invalidateQueries({ queryKey: trpc.campaign.pathKey() });
        router.push(`/admin/campaigns/${result.id}`);
      },
    }),
  );
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/campaigns"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to campaigns
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">
        Create a campaign
      </h1>
      <p className="mt-2 mb-7 text-sm text-muted-foreground">
        Set the terms now. Activate your draft when it is ready for creators.
      </p>
      <div className="rounded-xl border bg-card p-6 sm:p-8">
        <CampaignFormView
          saving={create.isPending}
          error={create.error?.message}
          onSubmit={async (values) => {
            await create.mutateAsync(values).catch(() => undefined);
          }}
          onCancel={() => router.push("/admin/campaigns")}
        />
      </div>
    </div>
  );
}
