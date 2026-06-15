import AuctionRoom from "./AuctionRoom";
import ViewportGate from "../../_components/ViewportGate";

export default async function Page({
  params,
}: PageProps<"/auctionroom/[slug]">) {
  const { slug } = await params;
  return (
    <ViewportGate pageLabel="AUCTION ROOM">
      <AuctionRoom matchId={slug} />
    </ViewportGate>
  );
}
