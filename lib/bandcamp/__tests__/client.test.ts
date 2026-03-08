import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BandcampClient } from '../client';

describe('BandcampClient', () => {
  let client: BandcampClient;

  beforeEach(() => {
    client = new BandcampClient('test-identity-cookie');
  });

  it('throws if no identity cookie provided', () => {
    expect(() => new BandcampClient('')).toThrow('Identity cookie is required');
  });

  it('sends identity cookie on authenticated GET requests', async () => {
    const mockResponse = { fan_id: 12345, collection_summary: {} };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await client.get('/api/fan/2/collection_summary');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bandcamp.com/api/fan/2/collection_summary',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'identity=test-identity-cookie',
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('sends form-encoded body on authenticated POST requests', async () => {
    const mockResponse = { ok: true, stories: { entries: [] } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await client.postForm('/fan_dash_feed_updates', {
      fan_id: '12345',
      older_than: '1709000000',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bandcamp.com/fan_dash_feed_updates',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: 'identity=test-identity-cookie',
        }),
      })
    );

    const call = fetchSpy.mock.calls[0];
    const body = (call[1] as RequestInit).body as string;
    expect(body).toContain('fan_id=12345');
    expect(body).toContain('older_than=1709000000');

    fetchSpy.mockRestore();
  });

  it('sends JSON body on POST requests to fancollection endpoints', async () => {
    const mockResponse = { items: [], more_available: false };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await client.postJson('/api/fancollection/1/collection_items', {
      fan_id: 12345,
      older_than_token: '9999999999:9999999999:a::',
      count: 20,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bandcamp.com/api/fancollection/1/collection_items',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: 'identity=test-identity-cookie',
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('throws on non-OK responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 })
    );

    await expect(client.get('/api/fan/2/collection_summary')).rejects.toThrow(
      'Bandcamp API error: 403'
    );

    vi.restoreAllMocks();
  });
});
