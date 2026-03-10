const viewLoading = document.getElementById('view-loading');
const viewNotConnected = document.getElementById('view-not-connected');
const viewConnected = document.getElementById('view-connected');
const btnDisconnect = document.getElementById('btn-disconnect');
const connectedUsername = document.getElementById('connected-username');
const linkOpenBandpass = document.getElementById('link-open-bandpass');

function showView(view) {
  viewLoading.style.display = 'none';
  viewNotConnected.style.display = 'none';
  viewConnected.style.display = 'none';
  view.style.display = 'block';
}

async function checkStatus() {
  showView(viewLoading);

  const storage = await chrome.storage.local.get(['bandpassUrl', 'connected', 'username']);

  if (storage.connected && storage.bandpassUrl) {
    const status = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
    if (status.authenticated) {
      connectedUsername.textContent = status.username || storage.username || 'Connected';
      linkOpenBandpass.href = storage.bandpassUrl;
      showView(viewConnected);
      return;
    }
    await chrome.storage.local.remove(['connected', 'username', 'fanId']);
  }

  showView(viewNotConnected);
}

btnDisconnect.addEventListener('click', async () => {
  btnDisconnect.disabled = true;
  await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
  btnDisconnect.disabled = false;
  showView(viewNotConnected);
});

checkStatus();
