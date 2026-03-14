-- Add indexes for columns used in UPDATE WHERE clauses
CREATE INDEX IF NOT EXISTS idx_feed_items_track_stream_url ON feed_items(track_stream_url) WHERE track_stream_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_album_url ON feed_items(album_url) WHERE album_url != '';
CREATE INDEX IF NOT EXISTS idx_wishlist_items_stream_url ON wishlist_items(stream_url) WHERE stream_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wishlist_items_item_url ON wishlist_items(item_url);
