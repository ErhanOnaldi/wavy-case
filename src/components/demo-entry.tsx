"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Video, Waves } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { Button } from "@/components/ui/button";
import { ErrorNotice, Loading } from "./feedback";

export function DemoEntry() {
  const trpc = useTRPC(),
    router = useRouter(),
    queryClient = useQueryClient();
  const session = useQuery(trpc.session.me.queryOptions());
  const users = useQuery(
    trpc.session.switchableUsers.queryOptions(undefined, {
      enabled: session.data?.canSwitchUser === true && !session.data.user,
    }),
  );
  const select = useMutation(
    trpc.session.switchUser.mutationOptions({
      onSuccess: async (user) => {
        await queryClient.cancelQueries();
        queryClient.clear();
        window.location.assign(
          user.role === "admin" ? "/admin/campaigns" : "/campaigns",
        );
      },
    }),
  );
  useEffect(() => {
    if (session.data?.user)
      router.replace(
        session.data.user.role === "admin" ? "/admin/campaigns" : "/campaigns",
      );
  }, [session.data, router]);
  if (session.isPending || session.data?.user)
    return <Loading label="Opening Wavy…" />;
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="mb-10 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Waves className="size-7 text-primary" aria-hidden="true" />
        wavy
      </div>
      <p className="eyebrow">CAMPAIGNS & CLIPS</p>
      <h1 className="mt-3 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
        Good content.
        <br />
        Clear rewards.
      </h1>
      <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
        A small workspace for clipping campaigns. Review submissions as an
        admin, or find your next campaign as a creator.
      </p>
      <div className="mt-9 space-y-4">
        {(session.error || users.error || select.error) && (
          <ErrorNotice
            message={(session.error ?? users.error ?? select.error)!.message}
            retry={() => {
              session.refetch();
              users.refetch();
            }}
          />
        )}
        {session.data?.canSwitchUser ? (
          users.isPending ? (
            <Loading label="Loading demo accounts…" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {["admin", "creator"].map((role) => {
                const account = users.data?.find((user) => user.role === role);
                const Icon = role === "admin" ? ShieldCheck : Video;
                return (
                  <div key={role} className="rounded-xl border bg-card p-6">
                    <Icon
                      className="mb-4 size-6 text-primary"
                      aria-hidden="true"
                    />
                    <h2 className="font-semibold">
                      {role === "admin"
                        ? "Manage campaigns"
                        : "Create & submit"}
                    </h2>
                    <p className="mt-2 mb-5 text-sm leading-6 text-muted-foreground">
                      {role === "admin"
                        ? "Set a budget, review clips, and follow campaign performance."
                        : "Browse active campaigns and keep track of your submissions."}
                    </p>
                    <Button
                      className="w-full"
                      variant={role === "admin" ? "default" : "outline"}
                      disabled={!account || select.isPending}
                      onClick={() =>
                        account && select.mutate({ userId: account.id })
                      }
                    >
                      Continue as {role}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          !session.error && (
            <ErrorNotice message="Demo account selection is disabled in this environment." />
          )
        )}
      </div>
      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        This is an interactive demo with fictional accounts and simulated views.
        <br />
        You can switch accounts inside the workspace. No real payments are made.
      </p>
    </main>
  );
}
