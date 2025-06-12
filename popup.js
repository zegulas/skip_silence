const toggle = document.getElementById('toggle');
const statusIndicator = document.getElementById('status-indicator');
const currentTabDiv = document.getElementById('current-tab');

// Load current settings and update UI
chrome.storage.sync.get({ enabled: true }, data => {
    toggle.checked = data.enabled;
    updateStatusIndicator(data.enabled);
});

// Update status indicator
function updateStatusIndicator(enabled) {
    if (enabled) {
        statusIndicator.classList.add('active');
    } else {
        statusIndicator.classList.remove('active');
    }
}

// Handle toggle changes
toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
        updateStatusIndicator(enabled);
        console.log('Auto-2x extension:', enabled ? 'enabled' : 'disabled');
    });
});

// Get current tab info
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) {
        const url = new URL(tab.url);
        currentTabDiv.textContent = `Current: ${url.hostname}`;
        
        // Check if this is a video site
        const videoSites = ['youtube.com', 'vimeo.com', 'dailymotion.com', 'twitch.tv'];
        const isVideoSite = videoSites.some(site => url.hostname.includes(site));
        
        if (isVideoSite) {
            currentTabDiv.textContent += ' ✓';
            currentTabDiv.style.color = '#4caf50';
        }
    }
});

// Options link
document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
});

// Test link
document.getElementById('test-link').addEventListener('click', async (e) => {
    e.preventDefault();
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const video = document.querySelector('video');
                if (video) {
                    console.log('Auto-2x test: Video element found');
                    console.log('Current playback rate:', video.playbackRate);
                    console.log('Video paused:', video.paused);
                    console.log('Video muted:', video.muted);
                    console.log('Video volume:', video.volume);
                    
                    // Try to detect if our extension is running
                    const hasExtension = window.performance.getEntriesByName('auto-2x-extension').length > 0;
                    console.log('Extension detected:', hasExtension);
                    
                    return {
                        hasVideo: true,
                        playbackRate: video.playbackRate,
                        paused: video.paused,
                        muted: video.muted,
                        volume: video.volume
                    };
                } else {
                    console.log('Auto-2x test: No video element found');
                    return { hasVideo: false };
                }
            }
        }, (results) => {
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.hasVideo) {
                    alert(`✓ Video found!\nPlayback rate: ${result.playbackRate}x\nPaused: ${result.paused}\nMuted: ${result.muted}\nVolume: ${result.volume}\n\nCheck console (F12) for detailed logs.`);
                } else {
                    alert('No video found on this page.');
                }
            }
        });
        
        window.close();
    } catch (error) {
        console.error('Test error:', error);
        alert('Could not test on current tab. Make sure you have permission to access this site.');
    }
});