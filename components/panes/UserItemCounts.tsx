import { Section, Row } from './shared';

export interface UserItemCountsProps {
  totalFeedItems: number;
  newReleases: number;
  friendPurchases: number;
  myPurchases: number;
  crateCount: number;
  wishlistCount: number;
}

export function UserItemCounts({
  totalFeedItems,
  newReleases,
  friendPurchases,
  myPurchases,
  crateCount,
  wishlistCount,
}: UserItemCountsProps) {
  return (
    <Section title="Items">
      <Row label="Feed items">{totalFeedItems.toLocaleString()}</Row>
      <div className="ml-4 space-y-1">
        <Row label="New releases" sub>{newReleases.toLocaleString()}</Row>
        <Row label="Friend purchases" sub>{friendPurchases.toLocaleString()}</Row>
        <Row label="My purchases" sub>{myPurchases.toLocaleString()}</Row>
      </div>
      <Row label="Crates">{crateCount.toLocaleString()}</Row>
      <Row label="Wishlist items">{wishlistCount.toLocaleString()}</Row>
    </Section>
  );
}
