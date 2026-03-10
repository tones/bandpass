(function () {
  if (!document.querySelector('meta[name="bandpass"]')) return;

  document.documentElement.dataset.bandpassExtension = 'true';

  chrome.runtime.sendMessage({
    type: 'SET_BANDPASS_URL',
    url: window.location.origin,
  });

  document.addEventListener('bandpass:request-cookie', async () => {
    const cookie = await chrome.runtime.sendMessage({ type: 'GET_COOKIE' });
    document.dispatchEvent(
      new CustomEvent('bandpass:cookie-result', { detail: { cookie } }),
    );
  });
})();
