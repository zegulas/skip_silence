// Default values used by content.js too
const DEFAULTS = {
    SILENCE_THRESHOLD: 0.005,
    GRACE_MS: 400,
    NATURAL_RATE: 1.0,
    FAST_RATE: 2.0,
    enabled: true
};

const form = document.getElementById('form');
const status = document.getElementById('status');

// Load current settings
chrome.storage.sync.get(DEFAULTS, cfg => {
    form.th.value = cfg.SILENCE_THRESHOLD;
    form.grace.value = cfg.GRACE_MS;
    form.normal.value = cfg.NATURAL_RATE;
    form.fast.value = cfg.FAST_RATE;
    form.enabled.checked = cfg.enabled;
});

// Save
form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
        SILENCE_THRESHOLD: parseFloat(form.th.value),
        GRACE_MS: parseInt(form.grace.value, 10),
        NATURAL_RATE: parseFloat(form.normal.value),
        FAST_RATE: parseFloat(form.fast.value),
        enabled: form.enabled.checked
    };
    chrome.storage.sync.set(data, () => {
        status.textContent = 'Saved ✔';
        setTimeout(() => (status.textContent = ''), 1500);
    });
});

// Reset button
document.getElementById('reset').addEventListener('click', () => {
    chrome.storage.sync.set(DEFAULTS, () => {
        location.reload();
    });
});
