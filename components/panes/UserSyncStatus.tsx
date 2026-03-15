import { Section, Row, StatusBadge, formatDate, formatTimestamp } from './shared';

export interface UserSyncStatusProps {
  lastSyncAt: string | null;
  totalItems: number;
  deepSyncComplete: boolean;
  isDeepSyncing?: boolean;
  oldestStoryDate: number | null;
  collectionSynced: boolean;
  isCollectionSyncing?: boolean;
  purchaseCount: number;
  wishlistSynced: boolean;
  isWishlistSyncing?: boolean;
  wishlistCount: number;
}

export function UserSyncStatus({
  lastSyncAt,
  totalItems,
  deepSyncComplete,
  isDeepSyncing = false,
  oldestStoryDate,
  collectionSynced,
  isCollectionSyncing = false,
  purchaseCount,
  wishlistSynced,
  isWishlistSyncing = false,
  wishlistCount,
}: UserSyncStatusProps) {
  const oldestLabel = oldestStoryDate ? formatTimestamp(oldestStoryDate) : null;

  return (
    <Section title="Sync Status">
      <Row label="Last synced">
        {lastSyncAt ? formatDate(lastSyncAt) : 'Never'}
      </Row>
      <Row label="Total items">{totalItems.toLocaleString()}</Row>
      <Row label="Feed history">
        <StatusBadge
          done={deepSyncComplete}
          active={isDeepSyncing}
          doneLabel={oldestLabel ? `Complete \u00b7 back to ${oldestLabel}` : 'Complete'}
          activeLabel={oldestLabel ? `Syncing \u00b7 back to ${oldestLabel}` : 'Syncing...'}
          pendingLabel={oldestLabel ? `Pending \u00b7 back to ${oldestLabel}` : 'Pending'}
        />
      </Row>
      <Row label="Purchases">
        <StatusBadge
          done={collectionSynced}
          active={isCollectionSyncing}
          doneLabel={`${purchaseCount.toLocaleString()} items`}
          activeLabel="Syncing..."
          pendingLabel="Pending"
        />
      </Row>
      <Row label="Wishlist">
        <StatusBadge
          done={wishlistSynced}
          active={isWishlistSyncing}
          doneLabel={`${wishlistCount.toLocaleString()} items`}
          activeLabel="Syncing..."
          pendingLabel="Pending"
        />
      </Row>
    </Section>
  );
}
