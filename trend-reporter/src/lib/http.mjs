export class FetchError extends Error {
  constructor(message, { url, status, body } = {}) {
    super(message);
    this.name = "FetchError";
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

export async function fetchText(url, { method = "GET", headers = {}, body, timeoutMs = 15000, userAgent } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent || "neuro-trend-reporter/0.1",
        ...headers
      },
      body,
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new FetchError(`HTTP ${response.status} for ${url}`, {
        url,
        status: response.status,
        body: text.slice(0, 1000)
      });
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  return JSON.parse(text);
}

export async function postJson(url, payload, options = {}) {
  return fetchJson(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: JSON.stringify(payload)
  });
}
