"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Waves } from "lucide-react";
import { useTRPC } from "@/lib/trpc/provider";
import { Loading, ErrorNotice } from "./feedback";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC(),
    router = useRouter(),
    pathname = usePathname(),
    queryClient = useQueryClient();
  const session = useQuery(trpc.session.me.queryOptions());
  const user = session.data?.user;
  const users = useQuery(
    trpc.session.switchableUsers.queryOptions(undefined, {
      enabled: session.data?.canSwitchUser === true,
    }),
  );
  const switchUser = useMutation(
    trpc.session.switchUser.mutationOptions({
      onSuccess: async (nextUser) => {
        await queryClient.cancelQueries();
        queryClient.clear();
        window.location.assign(
          nextUser.role === "admin" ? "/admin/campaigns" : "/campaigns",
        );
      },
    }),
  );
  const correctArea =
    user &&
    (pathname.startsWith("/admin")
      ? user.role === "admin"
      : user.role === "creator");
  useEffect(() => {
    if (session.data && !user) router.replace("/");
    else if (user && !correctArea)
      router.replace(user.role === "admin" ? "/admin/campaigns" : "/campaigns");
  }, [session.data, user, correctArea, router]);
  if (session.error)
    return (
      <main className="mx-auto max-w-xl p-8">
        <ErrorNotice
          message={session.error.message}
          retry={() => session.refetch()}
        />
      </main>
    );
  if (!user || !correctArea) return <Loading label="Opening your workspace…" />;
  const home = user.role === "admin" ? "/admin/campaigns" : "/campaigns";
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-8">
            <Link
              href={home}
              className="flex items-center gap-2 text-xl font-bold tracking-tight"
            >
              <Waves className="size-6 text-primary" aria-hidden="true" />
              wavy
              <span className="ml-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-muted-foreground">
                DEMO
              </span>
            </Link>
            <nav aria-label="Main navigation" className="flex gap-5 text-sm">
              <Link
                href={home}
                aria-current={pathname.startsWith(home) ? "page" : undefined}
                className={cn(
                  "py-2 text-muted-foreground hover:text-foreground",
                  pathname.startsWith(home) && "font-medium text-foreground",
                )}
              >
                Campaigns
              </Link>
              {user.role === "creator" && (
                <Link
                  href="/my-submissions"
                  aria-current={
                    pathname === "/my-submissions" ? "page" : undefined
                  }
                  className={cn(
                    "py-2 text-muted-foreground hover:text-foreground",
                    pathname === "/my-submissions" &&
                      "font-medium text-foreground",
                  )}
                >
                  My submissions
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">
              {user.role}
            </span>
            {session.data?.canSwitchUser && users.data ? (
              <>
                <label htmlFor="account-switch" className="sr-only">
                  Switch demo account
                </label>
                <select
                  id="account-switch"
                  className="native-select max-w-56"
                  value={user.id}
                  disabled={switchUser.isPending}
                  onChange={(event) =>
                    switchUser.mutate({ userId: event.target.value })
                  }
                >
                  {users.data.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.email}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
            )}
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12"
      >
        {switchUser.error && (
          <div className="mb-6">
            <ErrorNotice message={switchUser.error.message} />
          </div>
        )}
        {children}
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-5 pb-8 text-xs text-muted-foreground sm:px-8">
        <span>Wavy · Campaigns & clips</span>
        <span>Fictional demo data · No real payments</span>
      </footer>
    </>
  );
}
