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
        SILENCE_THRESHOLD: parseFloat(form.th.value) || DEFAULTS.SILENCE_THRESHOLD,
        GRACE_MS: parseInt(form.grace.value, 10) || DEFAULTS.GRACE_MS,
        NATURAL_RATE: parseFloat(form.normal.value) || DEFAULTS.NATURAL_RATE,
        FAST_RATE: parseFloat(form.fast.value) || DEFAULTS.FAST_RATE,
        enabled: form.enabled.checked
    };
    
    // Validate values
    if (data.SILENCE_THRESHOLD < 0 || data.SILENCE_THRESHOLD > 1) {
        status.textContent = 'Error: Silence threshold must be between 0 and 1';
        status.style.color = 'red';
        return;
    }
    
    if (data.GRACE_MS < 0) {
        status.textContent = 'Error: Grace period cannot be negative';
        status.style.color = 'red';
        return;
    }
    
    if (data.NATURAL_RATE <= 0 || data.FAST_RATE <= 0) {
        status.textContent = 'Error: Speeds must be positive numbers';
        status.style.color = 'red';
        return;
    }
    
    chrome.storage.sync.set(data, () => {
        status.textContent = 'Settings saved successfully ✔';
        status.style.color = 'green';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    });
});

// Reset button
document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
        chrome.storage.sync.set(DEFAULTS, () => {
            location.reload();
        });
    }
});

// Test button
document.getElementById('test').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Inject a test script to check if the extension is working
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const video = document.querySelector('video');
                if (video) {
                    console.log('Auto-2x test: Video found, current playback rate:', video.playbackRate);
                    alert(`Video found! Current playback rate: ${video.playbackRate}x\n\nCheck the browser console (F12) for detailed logs.`);
                } else {
                    alert('No video element found on this page.');
                }
            }
        });
        
        status.textContent = 'Test executed - check the current tab';
        status.style.color = 'blue';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    } catch (error) {
        status.textContent = 'Error: Could not test on current tab';
        status.style.color = 'red';
        console.error('Test error:', error);
    }
});