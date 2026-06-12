import AuctionRoom from "./AuctionRoom";

export default async function Page({
  params,
}: PageProps<"/auctionroom/[slug]">) {
  const { slug } = await params;
  return <AuctionRoom matchId={slug} />;
}
