export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const number = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
export const platformLabels = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

export function parseMoney(value: string) {
  if (!/^\d+(\.\d{0,2})?$/.test(value)) return Number.NaN;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function toLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
