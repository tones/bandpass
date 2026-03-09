const BASE_URL = 'https://bandcamp.com';

export class BandcampClient {
  private cookie: string;

  constructor(identityCookie: string) {
    if (!identityCookie) {
      throw new Error('Identity cookie is required');
    }
    this.cookie = identityCookie;
  }

  private authHeaders(): Record<string, string> {
    return { Cookie: `identity=${this.cookie}` };
  }

  async get<T = unknown>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Bandcamp API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async postForm<T = unknown>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const body = new URLSearchParams(params).toString();
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Bandcamp API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async getHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Bandcamp page fetch error: ${response.status}`);
    }
    return response.text();
  }

  async postJson<T = unknown>(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Bandcamp API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}
