const BANDCAMP_COOKIE_URL = 'https://bandcamp.com';
const COOKIE_NAME = 'identity';

async function getIdentityCookie() {
  const cookie = await chrome.cookies.get({
    url: BANDCAMP_COOKIE_URL,
    name: COOKIE_NAME,
  });
  return cookie?.value ?? null;
}

async function getBandpassUrl() {
  const { bandpassUrl } = await chrome.storage.local.get('bandpassUrl');
  return bandpassUrl || null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_COOKIE') {
    getIdentityCookie().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_BANDPASS_URL') {
    getBandpassUrl().then(sendResponse);
    return true;
  }

  if (message.type === 'SET_BANDPASS_URL') {
    chrome.storage.local.set({ bandpassUrl: message.url }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'DISCONNECT') {
    handleDisconnect().then(sendResponse);
    return true;
  }

  if (message.type === 'CHECK_STATUS') {
    handleCheckStatus().then(sendResponse);
    return true;
  }
});

async function handleDisconnect() {
  const bandpassUrl = await getBandpassUrl();
  if (bandpassUrl) {
    try {
      await fetch(`${bandpassUrl}/api/auth/disconnect`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort server disconnect
    }
  }
  await chrome.storage.local.remove(['connected', 'username', 'fanId']);
  return { ok: true };
}

async function handleCheckStatus() {
  const bandpassUrl = await getBandpassUrl();
  if (!bandpassUrl) return { authenticated: false };

  try {
    const res = await fetch(`${bandpassUrl}/api/auth/status`, {
      credentials: 'include',
    });
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}
