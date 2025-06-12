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

    // Function to calculate RMS (Root Mean Square) for volume detection
    const rms = arr => Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);

    // Clean up existing audio connections
    function cleanupAudio() {
        try {
            if (mediaSource) {
                mediaSource.disconnect();
                mediaSource = null;
            }
            if (audioCtx && audioCtx.state !== 'closed') {
                audioCtx.close();
                audioCtx = null;
            }
            analyser = null;
            buf = null;
            isAnalyzing = false;
            audioInitialized = false;
            console.log('Auto-2x extension: Audio cleanup completed');
        } catch (error) {
            console.warn('Auto-2x extension: Error during cleanup:', error);
        }
    }

    // Initialize audio analysis with better error handling
    async function initAudioAnalysis() {
        if (audioInitialized) {
            console.log('Auto-2x extension: Audio already initialized');
            return true;
        }

        try {
            // Clean up any existing connections first
            cleanupAudio();

            // Create new AudioContext
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume context if it's suspended
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
                console.log('Auto-2x extension: AudioContext resumed');
            }

            // Check if video is ready
            if (video.readyState < 2) {
                console.log('Auto-2x extension: Video not ready, waiting...');
                await new Promise(resolve => {
                    const checkReady = () => {
                        if (video.readyState >= 2) {
                            resolve();
                        } else {
                            setTimeout(checkReady, 100);
                        }
                    };
                    checkReady();
                });
            }

            // Try to create media source - this is where the error occurs
            try {
                mediaSource = audioCtx.createMediaElementSource(video);
                console.log('Auto-2x extension: Media source created successfully');
            } catch (sourceError) {
                console.warn('Auto-2x extension: Cannot create media source (likely already connected):', sourceError.message);
                
                // Try alternative approach - create a new audio context with different settings
                audioCtx.close();
                audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                    latencyHint: 'interactive',
                    sampleRate: 44100
                });
                
                if (audioCtx.state === 'suspended') {
                    await audioCtx.resume();
                }
                
                // If this still fails, we'll use fallback method
                try {
                    mediaSource = audioCtx.createMediaElementSource(video);
                    console.log('Auto-2x extension: Media source created on second attempt');
                } catch (secondError) {
                    console.warn('Auto-2x extension: Still cannot create media source, using fallback method');
                    cleanupAudio();
                    return false; // Use fallback
                }
            }

            // Create analyser
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            
            // Connect the audio graph
            mediaSource.connect(analyser);
            analyser.connect(audioCtx.destination);

            buf = new Float32Array(analyser.frequencyBinCount);
            isAnalyzing = true;
            audioInitialized = true;
            
            console.log('Auto-2x extension: Audio analysis initialized successfully');
            return true;
        } catch (error) {
            console.warn('Auto-2x extension: Failed to initialize audio analysis:', error);
            cleanupAudio();
            return false;
        }
    }

    // Fallback method using video properties and heuristics
    function checkVideoVolumeHeuristic() {
        // Simple heuristic based on video state
        if (video.muted || video.volume === 0) {
            return true; // Consider muted as "silent"
        }
        
        // Check if video is paused (not really silent, but no audio)
        if (video.paused) {
            return false; // Don't speed up paused videos
        }
        
        // For videos without audio analysis, we'll be conservative
        // and not speed up unless we're really sure
        return false;
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
                tryInitAudio();
            }
        }
    });

    // Try to initialize audio analysis when user interacts with the page
    const tryInitAudio = async () => {
        if (!audioInitialized && settings.enabled) {
            console.log('Auto-2x extension: Attempting to initialize audio...');
            const success = await initAudioAnalysis();
            if (success) {
                console.log('Auto-2x extension: Audio initialization successful');
                // Remove event listeners since we succeeded
                document.removeEventListener('click', tryInitAudio);
                document.removeEventListener('keydown', tryInitAudio);
                video.removeEventListener('play', tryInitAudio);
                video.removeEventListener('loadeddata', tryInitAudio);
            } else {
                console.log('Auto-2x extension: Audio initialization failed, will use fallback method');
            }
        }
    };

    // Add event listeners to try initializing audio on user interaction
    document.addEventListener('click', tryInitAudio, { once: false });
    document.addEventListener('keydown', tryInitAudio, { once: false });
    video.addEventListener('play', tryInitAudio, { once: false });
    video.addEventListener('loadeddata', tryInitAudio, { once: false });

    // Try to initialize immediately (might work on some sites)
    setTimeout(tryInitAudio, 1000);

    // Watch for video element changes (YouTube dynamically replaces video elements)
    const videoObserver = new MutationObserver(() => {
        const newVideo = document.querySelector('video');
        if (newVideo && newVideo !== video) {
            console.log('Auto-2x extension: New video element detected, reinitializing...');
            cleanupAudio();
            // Restart the whole process with the new video element
            setTimeout(() => {
                window.auto2xExtensionLoaded = false;
                main();
            }, 500);
        }
    });

    videoObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    function tick() {
        if (!settings.enabled) {
            requestAnimationFrame(tick);
            return;
        }

        let isQuiet = false;

        if (isAnalyzing && analyser && buf) {
            try {
                analyser.getFloatTimeDomainData(buf);
                const vol = rms(buf);
                isQuiet = vol < settings.SILENCE_THRESHOLD;
                
                // Debug logging (remove in production)
                if (Math.random() < 0.01) { // Log 1% of the time to avoid spam
                    console.log('Auto-2x extension: Volume level:', vol.toFixed(4), 'Threshold:', settings.SILENCE_THRESHOLD, 'Quiet:', isQuiet);
                }
            } catch (error) {
                console.warn('Auto-2x extension: Audio analysis error:', error);
                isAnalyzing = false;
                // Try to reinitialize
                setTimeout(tryInitAudio, 1000);
            }
        } else {
            // Use fallback method
            isQuiet = checkVideoVolumeHeuristic();
        }

        if (isQuiet) {
            if (silentSince === null) {
                silentSince = performance.now();
            }
            if (performance.now() - silentSince > settings.GRACE_MS &&
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

    // Clean up when video ends or errors
    video.addEventListener('ended', cleanupAudio);
    video.addEventListener('error', cleanupAudio);

    console.log('Auto-2x extension: Initialized successfully');
})().catch(error => {
    console.error('Auto-2x extension: Fatal error:', error);
});