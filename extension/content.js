const ENABLE_BANDCAMP_BUTTON = false;

(async function bandpassContent() {
  if (!ENABLE_BANDCAMP_BUTTON) return;

  const storage = await chrome.storage.local.get(['bandpassUrl', 'connected']);
  if (!storage.connected || !storage.bandpassUrl) return;

  const bandpassUrl = storage.bandpassUrl.replace(/\/+$/, '');
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  const slug = hostname.replace('.bandcamp.com', '');
  if (!slug || hostname === 'bandcamp.com') return;

  let targetPath;

  if (pathname === '/' || pathname === '/music') {
    targetPath = `/music/${slug}`;
  } else if (pathname.startsWith('/album/') || pathname.startsWith('/track/')) {
    targetPath = `/music/${slug}`;
  } else {
    return;
  }

  const link = document.createElement('a');
  link.href = `${bandpassUrl}${targetPath}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'bandpass-open-btn';
  link.textContent = 'Open in Bandpass';
  link.title = 'View this artist in Bandpass';

  document.body.appendChild(link);
})();
