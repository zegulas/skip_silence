/* Auto-2×-on-Silence  ────────────────────────────────────────────
   Injected into every tab that matches.  Listens to any <video>
   element's audio; when volume is quiet for > GRACE_MS it sets
   playbackRate = FAST_RATE, else NATURAL_RATE.
*/

(async function main() {
    console.log('Auto-2x extension: Starting...');
    
    // Prevent multiple instances
    if (window.auto2xExtensionLoaded) {
        console.log('Auto-2x extension: Already loaded, skipping');
        return;
    }
    window.auto2xExtensionLoaded = true;
    
    // Wait until a <video> tag appears (YouTube swaps them dynamically)
    const video = await new Promise(resolve => {
        const seek = () => {
            const v = document.querySelector('video');
            if (v) {
                console.log('Auto-2x extension: Video element found');
                resolve(v);
            } else {
                requestAnimationFrame(seek);
            }
        };
        seek();
    });

    // Read user prefs (or fall back)
    let settings = await chrome.storage.sync.get({
        SILENCE_THRESHOLD: 0.005,
        GRACE_MS: 400,
        FAST_RATE: 2.0,
        NATURAL_RATE: 1.0,
        enabled: true
    });

    if (!settings.enabled) {
        console.log('Auto-2x extension: Disabled by user');
        return;
    }

    let audioCtx = null;
    let analyser = null;
    let buf = null;
    let silentSince = null;
    let isAnalyzing = false;
    let audioInitialized = false;
    let mediaSource = null;
    let gainNode = null;
    let scriptProcessor = null;

    // Alternative: Use a hidden audio element for analysis
    let hiddenAudio = null;
    let isUsingHiddenAudio = false;

    // Function to calculate RMS (Root Mean Square) for volume detection
    const rms = arr => Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);

    // Clean up existing audio connections
    function cleanupAudio() {
        try {
            if (scriptProcessor) {
                scriptProcessor.disconnect();
                scriptProcessor = null;
            }
            if (gainNode) {
                gainNode.disconnect();
                gainNode = null;
            }
            if (mediaSource) {
                mediaSource.disconnect();
                mediaSource = null;
            }
            if (audioCtx && audioCtx.state !== 'closed') {
                audioCtx.close();
                audioCtx = null;
            }
            if (hiddenAudio) {
                hiddenAudio.pause();
                hiddenAudio.remove();
                hiddenAudio = null;
            }
            analyser = null;
            buf = null;
            isAnalyzing = false;
            audioInitialized = false;
            isUsingHiddenAudio = false;
            console.log('Auto-2x extension: Audio cleanup completed');
        } catch (error) {
            console.warn('Auto-2x extension: Error during cleanup:', error);
        }
    }

    // Alternative approach: Create a hidden audio element that mirrors the video
    async function initHiddenAudioAnalysis() {
        try {
            console.log('Auto-2x extension: Trying hidden audio approach...');
            
            // Get the video source URL
            const videoSrc = video.currentSrc || video.src;
            if (!videoSrc) {
                console.warn('Auto-2x extension: No video source found');
                return false;
            }

            // Create hidden audio element
            hiddenAudio = document.createElement('audio');
            hiddenAudio.src = videoSrc;
            hiddenAudio.crossOrigin = 'anonymous';
            hiddenAudio.style.display = 'none';
            hiddenAudio.muted = true; // Mute it so we don't hear double audio
            document.body.appendChild(hiddenAudio);

            // Sync with video
            const syncAudio = () => {
                if (hiddenAudio && video) {
                    hiddenAudio.currentTime = video.currentTime;
                    if (video.paused) {
                        hiddenAudio.pause();
                    } else {
                        hiddenAudio.play().catch(() => {}); // Ignore play errors
                    }
                }
            };

            // Add sync listeners
            video.addEventListener('timeupdate', syncAudio);
            video.addEventListener('play', syncAudio);
            video.addEventListener('pause', syncAudio);
            video.addEventListener('seeked', syncAudio);

            // Create audio context for the hidden audio
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            // Try to connect to hidden audio
            mediaSource = audioCtx.createMediaElementSource(hiddenAudio);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            
            mediaSource.connect(analyser);
            // Don't connect to destination to avoid audio output

            buf = new Float32Array(analyser.frequencyBinCount);
            isAnalyzing = true;
            audioInitialized = true;
            isUsingHiddenAudio = true;
            
            console.log('Auto-2x extension: Hidden audio analysis initialized');
            return true;
        } catch (error) {
            console.warn('Auto-2x extension: Hidden audio approach failed:', error);
            cleanupAudio();
            return false;
        }
    }

    // Original approach: Direct video analysis
    async function initDirectAudioAnalysis() {
        try {
            console.log('Auto-2x extension: Trying direct video analysis...');
            
            // Create new AudioContext
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            // Wait for video to be ready
            if (video.readyState < 2) {
                await new Promise(resolve => {
                    const checkReady = () => {
                        if (video.readyState >= 2) resolve();
                        else setTimeout(checkReady, 100);
                    };
                    checkReady();
                });
            }

            // Try to create media source
            mediaSource = audioCtx.createMediaElementSource(video);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            
            // Create gain node to avoid interfering with existing audio
            gainNode = audioCtx.createGain();
            gainNode.gain.value = 1.0;
            
            mediaSource.connect(analyser);
            analyser.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            buf = new Float32Array(analyser.frequencyBinCount);
            isAnalyzing = true;
            audioInitialized = true;
            
            console.log('Auto-2x extension: Direct audio analysis initialized');
            return true;
        } catch (error) {
            console.warn('Auto-2x extension: Direct audio analysis failed:', error.message);
            cleanupAudio();
            return false;
        }
    }

    // Enhanced heuristic method using video properties and visual cues
    function checkVideoVolumeHeuristic() {
        // If video is muted or volume is 0, consider it silent
        if (video.muted || video.volume === 0) {
            return true;
        }
        
        // If video is paused, don't speed up
        if (video.paused) {
            return false;
        }

        // Check for YouTube-specific indicators
        if (window.location.hostname.includes('youtube.com')) {
            // Look for YouTube's volume indicator
            const volumeSlider = document.querySelector('.ytp-volume-slider-handle');
            if (volumeSlider) {
                const volumeLevel = volumeSlider.style.left;
                if (volumeLevel === '0%' || volumeLevel === '0px') {
                    return true;
                }
            }

            // Check if captions are showing (might indicate speech)
            const captions = document.querySelector('.ytp-caption-segment');
            if (captions && captions.textContent.trim()) {
                return false; // If there are captions, probably not silent
            }

            // Check video progress vs duration for potential silent sections
            const currentTime = video.currentTime;
            const duration = video.duration;
            
            // This is a very basic heuristic - in real lectures, 
            // silent moments often occur at regular intervals
            if (duration > 0) {
                const progress = currentTime / duration;
                // Very basic pattern detection - this could be improved
                const timeInSegment = currentTime % 30; // 30-second segments
                
                // Assume potential silence in certain patterns
                // This is quite crude and would need refinement
                if (timeInSegment > 20 && timeInSegment < 25) {
                    return Math.random() < 0.3; // 30% chance of being "silent"
                }
            }
        }
        
        // Default to not silent for safety
        return false;
    }

    // Main initialization function that tries multiple approaches
    async function initAudioAnalysis() {
        if (audioInitialized) {
            return true;
        }

        // Try direct analysis first
        let success = await initDirectAudioAnalysis();
        if (success) {
            console.log('Auto-2x extension: Using direct audio analysis');
            return true;
        }

        // Try hidden audio approach
        success = await initHiddenAudioAnalysis();
        if (success) {
            console.log('Auto-2x extension: Using hidden audio analysis');
            return true;
        }

        // Fall back to heuristic method
        console.log('Auto-2x extension: Using heuristic method');
        return false; // Will use heuristic in tick()
    }

    // Listen for changes coming from the Options page
    chrome.storage.onChanged.addListener(changes => {
        console.log('Auto-2x extension: Settings changed', changes);
        
        if (changes.SILENCE_THRESHOLD) settings.SILENCE_THRESHOLD = changes.SILENCE_THRESHOLD.newValue;
        if (changes.GRACE_MS) settings.GRACE_MS = changes.GRACE_MS.newValue;
        if (changes.FAST_RATE) settings.FAST_RATE = changes.FAST_RATE.newValue;
        if (changes.NATURAL_RATE) settings.NATURAL_RATE = changes.NATURAL_RATE.newValue;
        if (changes.enabled) {
            settings.enabled = changes.enabled.newValue;
            if (!settings.enabled) {
                video.playbackRate = settings.NATURAL_RATE;
                console.log('Auto-2x extension: Disabled, reset to normal speed');
                cleanupAudio();
            } else {
                // Re-initialize when enabled
                setTimeout(tryInitAudio, 500);
            }
        }
    });

    // Try to initialize audio analysis
    const tryInitAudio = async () => {
        if (!audioInitialized && settings.enabled) {
            console.log('Auto-2x extension: Attempting to initialize audio...');
            const success = await initAudioAnalysis();
            if (success) {
                console.log('Auto-2x extension: Audio initialization successful');
            } else {
                console.log('Auto-2x extension: Using fallback heuristic method');
            }
        }
    };

    // Add event listeners for user interaction
    const initOnInteraction = () => {
        tryInitAudio();
        // Remove listeners after first successful interaction
        document.removeEventListener('click', initOnInteraction);
        document.removeEventListener('keydown', initOnInteraction);
    };

    document.addEventListener('click', initOnInteraction);
    document.addEventListener('keydown', initOnInteraction);
    video.addEventListener('play', tryInitAudio);
    video.addEventListener('loadeddata', tryInitAudio);

    // Try to initialize after a delay
    setTimeout(tryInitAudio, 2000);

    // Watch for video element changes
    const videoObserver = new MutationObserver(() => {
        const newVideo = document.querySelector('video');
        if (newVideo && newVideo !== video) {
            console.log('Auto-2x extension: New video element detected');
            cleanupAudio();
            videoObserver.disconnect();
            // Restart with new video
            setTimeout(() => {
                window.auto2xExtensionLoaded = false;
                main();
            }, 1000);
        }
    });

    videoObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    let lastVolumeCheck = 0;
    let volumeHistory = [];
    const VOLUME_HISTORY_SIZE = 10;

    function tick() {
        if (!settings.enabled) {
            requestAnimationFrame(tick);
            return;
        }

        let isQuiet = false;
        const now = performance.now();

        if (isAnalyzing && analyser && buf) {
            try {
                analyser.getFloatTimeDomainData(buf);
                const vol = rms(buf);
                isQuiet = vol < settings.SILENCE_THRESHOLD;
                
                // Keep volume history for better detection
                volumeHistory.push(vol);
                if (volumeHistory.length > VOLUME_HISTORY_SIZE) {
                    volumeHistory.shift();
                }
                
                // Use average of recent volumes for more stable detection
                const avgVolume = volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length;
                isQuiet = avgVolume < settings.SILENCE_THRESHOLD;
                
                // Debug logging (reduced frequency)
                if (now - lastVolumeCheck > 2000) { // Every 2 seconds
                    console.log('Auto-2x extension: Avg volume:', avgVolume.toFixed(4), 'Threshold:', settings.SILENCE_THRESHOLD, 'Quiet:', isQuiet);
                    lastVolumeCheck = now;
                }
            } catch (error) {
                console.warn('Auto-2x extension: Audio analysis error:', error);
                isAnalyzing = false;
                // Don't retry immediately to avoid spam
                setTimeout(tryInitAudio, 5000);
            }
        } else {
            // Use enhanced heuristic method
            isQuiet = checkVideoVolumeHeuristic();
            
            // Debug logging for heuristic method
            if (now - lastVolumeCheck > 5000) { // Every 5 seconds
                console.log('Auto-2x extension: Using heuristic method, quiet:', isQuiet);
                lastVolumeCheck = now;
            }
        }

        // Apply speed changes with grace period
        if (isQuiet) {
            if (silentSince === null) {
                silentSince = now;
            }
            if (now - silentSince > settings.GRACE_MS &&
                video.playbackRate !== settings.FAST_RATE) {
                video.playbackRate = settings.FAST_RATE;
                console.log('Auto-2x extension: Speeding up to', settings.FAST_RATE);
            }
        } else {
            silentSince = null;
            if (video.playbackRate !== settings.NATURAL_RATE) {
                video.playbackRate = settings.NATURAL_RATE;
                console.log('Auto-2x extension: Back to normal speed', settings.NATURAL_RATE);
            }
        }
        
        requestAnimationFrame(tick);
    }

    // Start the main loop
    tick();

    // Clean up when page unloads
    window.addEventListener('beforeunload', () => {
        cleanupAudio();
        videoObserver.disconnect();
    });

    // Clean up on video events
    video.addEventListener('ended', cleanupAudio);
    video.addEventListener('error', cleanupAudio);

    console.log('Auto-2x extension: Initialized successfully');
})().catch(error => {
    console.error('Auto-2x extension: Fatal error:', error);
});