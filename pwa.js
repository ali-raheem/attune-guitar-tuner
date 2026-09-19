import './version.js';

const installButton = document.getElementById('installButton');
const installStatus = document.getElementById('installStatus');
document.getElementById('appVersion').textContent = globalThis.ATTUNE_BUILD.label;
const report = message => { installStatus.textContent = message; installStatus.hidden = false; };
let installPrompt;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event; installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt; installPrompt = null; installButton.hidden = true;
  try { await prompt.prompt(); await prompt.userChoice; }
  catch { report('Use your browser menu to install Attune.'); }
});
window.addEventListener('appinstalled', () => { installPrompt = null; installButton.hidden = true; });

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { updateViaCache: 'none' })
    .then(registration => {
      const updateStatus = () => {
        if (registration.waiting) report('An update is ready. Close all Attune windows and reopen to use it.');
      };
      const watch = () => registration.installing?.addEventListener('statechange', updateStatus);
      updateStatus(); watch(); registration.addEventListener('updatefound', watch);
    })
    .catch(() => report('Offline setup could not finish. Reopen Attune with a connection to try again.'));
}
