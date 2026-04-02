// Camera and app state
let videoStream = null;
let video = null;
let canvas = null;
let ctx = null;
let currentFacingMode = 'user';
let currentBlob = null;

// View elements
const cameraView = document.getElementById('camera-view');
const loadingView = document.getElementById('loading-view');
const resultView = document.getElementById('result-view');
const errorView = document.getElementById('error-view');
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const resultImage = document.getElementById('result-image');
const captureBtn = document.getElementById('capture-btn');
const flipBtn = document.getElementById('flip-btn');
const retryBtn = document.getElementById('retry-btn');
const saveBtn = document.getElementById('save-btn');
const errorRetryBtn = document.getElementById('error-retry-btn');
const errorMessage = document.getElementById('error-message');
const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Initialize
function init() {
    video = videoElement;
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    
    // Event listeners
    captureBtn.addEventListener('click', capturePhoto);
    if (flipBtn) flipBtn.addEventListener('click', flipCamera);
    retryBtn.addEventListener('click', resetToCamera);
    if (saveBtn) saveBtn.addEventListener('click', saveOrShareImage);
    errorRetryBtn.addEventListener('click', resetToCamera);
    if (aboutBtn) aboutBtn.addEventListener('click', openAboutModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeAboutModal);
    if (aboutModal) aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) closeAboutModal();
    });
    
    // Start camera
    startCamera();
}

// Start camera stream
async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = videoStream;
        
        // Mirror video only for front-facing camera
        video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        
        video.play();
    } catch (error) {
        console.error('Error accessing camera:', error);
        showError('Unable to access camera. Please allow camera permissions.');
    }
}

// Capture photo from video stream
function capturePhoto() {
    if (!video || !canvas) return;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    ctx.save();
    if (currentFacingMode === 'user') {
        // Mirror front-facing camera back to normal
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    
    // Convert to blob and send to API
    canvas.toBlob(async (blob) => {
        if (!blob) {
            showError('Failed to capture photo');
            return;
        }
        
        // Stop camera stream
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        
        // Show loading view
        showView('loading');
        
        // Send to API
        try {
            const transformedBlob = await transformImage(blob);
            const watermarkedBlob = await addWatermark(transformedBlob);
            currentBlob = watermarkedBlob;
            showResult(URL.createObjectURL(watermarkedBlob));
        } catch (error) {
            console.error('Error transforming image:', error);
            
            // Try to parse error message for better user feedback
            let errorMsg = 'Failed to transform image. Please try again.';
            try {
                const errorJson = JSON.parse(error.message);
                if (errorJson.error) {
                    errorMsg = errorJson.error;
                }
            } catch (e) {
                // If error message contains quota info, show a helpful message
                if (error.message.includes('429') || error.message.includes('quota')) {
                    errorMsg = 'API quota exceeded. Please check your Gemini API plan settings.';
                }
            }
            
            showError(errorMsg);
        }
    }, 'image/jpeg', 0.9);
}

// Add frogify.org watermark to a blob image
async function addWatermark(blob) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const wCanvas = document.createElement('canvas');
            wCanvas.width = img.naturalWidth;
            wCanvas.height = img.naturalHeight;
            const wCtx = wCanvas.getContext('2d');

            // Draw the transformed image
            wCtx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            // Watermark style — subtle credit in bottom-right
            const fontSize = Math.max(20, Math.round(img.naturalWidth * 0.032));
            wCtx.font = `600 ${fontSize}px -apple-system, sans-serif`;
            wCtx.textAlign = 'right';
            wCtx.textBaseline = 'bottom';

            const padding = Math.round(fontSize * 0.7);
            const x = img.naturalWidth - padding;
            const y = img.naturalHeight - padding;

            // Soft shadow for legibility on any background
            wCtx.shadowColor = 'rgba(0,0,0,0.55)';
            wCtx.shadowBlur = 6;
            wCtx.shadowOffsetX = 1;
            wCtx.shadowOffsetY = 1;

            wCtx.fillStyle = 'rgba(255,255,255,0.65)';
            wCtx.fillText('frogify.org', x, y);

            wCanvas.toBlob((watermarkedBlob) => {
                resolve(watermarkedBlob || blob);
            }, blob.type || 'image/jpeg', 0.92);
        };
        img.onerror = () => resolve(blob); // Fallback: return original if anything fails
        img.src = url;
    });
}

// Send image to backend API for transformation
async function transformImage(imageBlob) {
    // Convert blob to base64 for easier handling
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
    });
    
    const response = await fetch('/api/transform', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image: base64,
            mimeType: imageBlob.type || 'image/jpeg'
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'API request failed');
    }
    
    return await response.blob();
}

// Show result image
function showResult(imageUrl) {
    resultImage.src = imageUrl;
    showView('result');
}

// Show error message
function showError(message) {
    // Truncate very long error messages for better display
    const displayMessage = message.length > 200 ? message.substring(0, 200) + '...' : message;
    errorMessage.textContent = displayMessage;
    showView('error');
}

// Reset to camera view
function resetToCamera() {
    // Clean up result image URL
    if (resultImage.src && resultImage.src.startsWith('blob:')) {
        URL.revokeObjectURL(resultImage.src);
    }
    currentBlob = null;
    
    showView('camera');
    startCamera();
}

function openAboutModal() {
    if (aboutModal) {
        aboutModal.classList.add('open');
        aboutModal.setAttribute('aria-hidden', 'false');
    }
}

function closeAboutModal() {
    if (aboutModal) {
        aboutModal.classList.remove('open');
        aboutModal.setAttribute('aria-hidden', 'true');
    }
}

function flipCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    startCamera();
}

async function saveOrShareImage() {
    if (!currentBlob) return;
    
    const file = new File([currentBlob], 'frogify-me.png', { type: currentBlob.type || 'image/png' });
    
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                title: 'My Frogify Transformation',
                text: 'I turned myself into a frog! 🐸',
                files: [file]
            });
        } catch (error) {
            // Ignore AbortError (user cancelled share)
            if (error.name !== 'AbortError') {
                console.error('Error sharing:', error);
                downloadImage(); // Fallback to download
            }
        }
    } else {
        // Fallback for browsers that don't support file sharing
        downloadImage();
    }
}

function downloadImage() {
    if (!currentBlob) return;
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frogify-me.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Don't revoke immediately, as it might break the download in some browsers
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Switch between views
function showView(viewName) {
    // Hide all views
    cameraView.classList.remove('active');
    loadingView.classList.remove('active');
    resultView.classList.remove('active');
    errorView.classList.remove('active');
    
    // Show requested view
    switch(viewName) {
        case 'camera':
            cameraView.classList.add('active');
            break;
        case 'loading':
            loadingView.classList.add('active');
            break;
        case 'result':
            resultView.classList.add('active');
            break;
        case 'error':
            errorView.classList.add('active');
            break;
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
