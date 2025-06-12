const cb = document.getElementById('toggle');

chrome.storage.sync.get({ enabled: true }, data => {
    cb.checked = data.enabled;
});

cb.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: cb.checked });
});
