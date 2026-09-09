"use client";

import { useState, type Ref } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice, FieldError } from "@/components/feedback";
import { parseMoney, platformLabels, toLocalInput } from "@/lib/format";
import { platforms } from "@/features/shared";
import { campaignFormSchema, type CampaignForm } from "../schemas";

function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  errorId,
  ref,
}: {
  ref?: Ref<HTMLInputElement>;
  id: string;
  value: number;
  onChange: (value: number) => void;
  onBlur: () => void;
  disabled?: boolean;
  invalid: boolean;
  errorId: string;
}) {
  const [text, setText] = useState(() => (value / 100).toFixed(2));
  return (
    <div className="relative">
      <span
        className="absolute top-2 left-3 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        $
      </span>
      <Input
        id={id}
        ref={ref}
        inputMode="decimal"
        className="pl-7"
        value={text}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={errorId}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseMoney(event.target.value));
        }}
        onBlur={onBlur}
      />
    </div>
  );
}

export function CampaignFormView({
  initial,
  termsLocked = false,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: CampaignForm;
  termsLocked?: boolean;
  saving: boolean;
  error?: string;
  onSubmit: (values: CampaignForm) => Promise<void>;
  onCancel?: () => void;
}) {
  const form = useForm<CampaignForm>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: initial ?? {
      title: "",
      platforms: ["youtube"],
      payoutPer1kViewsCents: 150,
      totalBudgetCents: 50_000,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
    >
      {error && <ErrorNotice message={error} />}
      {termsLocked && (
        <p className="rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">
          This campaign has submissions. You can edit its title or increase the
          budget; the original platform, rate, and dates stay fixed.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="campaign-title">Campaign title</Label>
        <Input
          id="campaign-title"
          placeholder="Give your campaign a clear name"
          {...form.register("title")}
          aria-invalid={!!errors.title}
          aria-describedby="title-error"
          maxLength={120}
        />
        <FieldError id="title-error" message={errors.title?.message} />
      </div>
      <fieldset className="space-y-2" disabled={termsLocked}>
        <legend className="mb-2 text-sm font-medium">Platforms</legend>
        <Controller
          control={form.control}
          name="platforms"
          render={({ field }) => (
            <div className="flex flex-wrap gap-3">
              {platforms.map((platform) => (
                <label
                  key={platform}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-accent has-disabled:cursor-default has-disabled:opacity-60"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    value={platform}
                    checked={field.value.includes(platform)}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(
                        event.target.checked
                          ? [...field.value, platform]
                          : field.value.filter((item) => item !== platform),
                      )
                    }
                    aria-describedby="platforms-error"
                  />
                  {platformLabels[platform]}
                </label>
              ))}
            </div>
          )}
        />
        <FieldError id="platforms-error" message={errors.platforms?.message} />
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        {(["payoutPer1kViewsCents", "totalBudgetCents"] as const).map(
          (name) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={name}>
                {name === "totalBudgetCents"
                  ? "Total budget (USD)"
                  : "Payout per 1,000 views (USD)"}
              </Label>
              <Controller
                name={name}
                control={form.control}
                render={({ field }) => (
                  <MoneyInput
                    id={name}
                    {...field}
                    disabled={termsLocked && name === "payoutPer1kViewsCents"}
                    invalid={!!errors[name]}
                    errorId={`${name}-error`}
                  />
                )}
              />
              <FieldError
                id={`${name}-error`}
                message={errors[name]?.message}
              />
            </div>
          ),
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {(["startsAt", "endsAt"] as const).map((name) => (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>
              {name === "startsAt" ? "Starts at" : "Ends at"}
            </Label>
            <Controller
              control={form.control}
              name={name}
              render={({ field }) => (
                <Input
                  id={name}
                  ref={field.ref}
                  type="datetime-local"
                  disabled={termsLocked}
                  value={toLocalInput(field.value)}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value
                        ? new Date(event.target.value).toISOString()
                        : "",
                    )
                  }
                  aria-invalid={!!errors[name]}
                  aria-describedby={`${name}-error`}
                />
              )}
            />
            <FieldError id={`${name}-error`} message={errors[name]?.message} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Dates use your local time. Campaigns can run for up to 366 days.
      </p>
      <div className="flex justify-end gap-3 border-t pt-5">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving || form.formState.isSubmitting}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
