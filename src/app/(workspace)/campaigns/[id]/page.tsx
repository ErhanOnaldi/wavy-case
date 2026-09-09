import { CreatorCampaignDetail } from "@/features/campaigns/components/creator-campaign-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CreatorCampaignDetail id={id} />;
}
