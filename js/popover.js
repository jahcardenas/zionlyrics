const TOAST_DURATION = 10000;
let _toastTimer = null;
let _toastStartTime = 0;
let _toastElapsedBeforePause = 0;
let _toastPaused = false;
let _toastHoverBound = false;

function showAppToast(message, duration = TOAST_DURATION) {
    const toast = $('app-toast');
    if (!toast) return;

    const msgEl = toast.querySelector('.app-toast-message');
    const progressEl = toast.querySelector('.app-toast-progress');

    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

    msgEl.textContent = message;

    // Resetear animación de la barra
    progressEl.classList.remove('paused');
    progressEl.style.animation = 'none';
    void progressEl.offsetWidth;
    progressEl.style.animation = '';
    progressEl.style.animationDuration = duration + 'ms';
    progressEl.style.width = '100%';

    _toastStartTime = Date.now();
    _toastElapsedBeforePause = 0;
    _toastPaused = false;

    toast.classList.add('visible');

    _toastTimer = setTimeout(hideAppToast, duration);

    if (!_toastHoverBound) {
        _toastHoverBound = true;

        toast.addEventListener('mouseenter', () => {
            if (_toastPaused || !_toastTimer) return;
            _toastPaused = true;

            const elapsed = Date.now() - _toastStartTime;
            _toastElapsedBeforePause += elapsed;

            progressEl.classList.add('paused');
            clearTimeout(_toastTimer);
            _toastTimer = null;
        });

        toast.addEventListener('mouseleave', () => {
            if (!_toastPaused) return;
            _toastPaused = false;

            progressEl.classList.remove('paused');

            const remaining = duration - _toastElapsedBeforePause;
            _toastStartTime = Date.now();

            if (remaining > 0) {
                _toastTimer = setTimeout(hideAppToast, remaining);
            } else {
                hideAppToast();
            }
        });
    }
}

function hideAppToast() {
    const toast = $('app-toast');
    if (!toast) return;

    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    _toastPaused = false;
    _toastElapsedBeforePause = 0;

    toast.classList.remove('visible');
    const progressEl = toast.querySelector('.app-toast-progress');
    if (progressEl) progressEl.classList.remove('paused');
}