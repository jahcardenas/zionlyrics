(function () {
    'use strict';

    let _hsv = { h: 0, s: 0, v: 0 };
    let _onAccept = null;

    function hsvToHex(h, s, v) {
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let r, g, b;
        if      (h < 60)  { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
        const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    function hexToHsv(hex) {
        const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!m) return { h: 0, s: 0, v: 0 };
        const r = parseInt(m[1], 16) / 255;
        const g = parseInt(m[2], 16) / 255;
        const b = parseInt(m[3], 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        if (d !== 0) {
            if      (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else                h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        const s = max === 0 ? 0 : d / max;
        return { h, s, v: max };
    }

    function open(anchorEl, onAccept, initialColor) {
        _onAccept = onAccept || null;
        _hsv = (initialColor && /^#[a-fA-F0-9]{6}$/.test(initialColor))
            ? hexToHsv(initialColor)
            : { h: 0, s: 0, v: 0 };

        PickerBase.open(anchorEl, {
            className: 'color-picker',
            minWidth: 240,
            ignoreCloseFrom: ['.cc-shadow-picker', '.cc-multi-picker', '.cc-position-picker'],
            content: `
                <canvas class="cc-cp-square" width="216" height="140"></canvas>
                <input type="range" class="cc-cp-hue" min="0" max="360" value="0">
                <div class="cc-cp-bottom">
                    <div class="cc-cp-preview"></div>
                    <input type="text" class="cc-cp-hex" value="#000000" maxlength="7" spellcheck="false">
                </div>
                <div class="cc-cp-actions modal-footer-right">
                    <div class="code-btn code-btn-primary cc-cp-ok" data-i18n="str26">Aceptar</div>
                    <div class="code-btn code-btn-cancel cc-cp-cancel" data-i18n="str27">Cancelar</div>
                </div>
            `,
            onMount(el, closeFn) {
                const square    = el.querySelector('.cc-cp-square');
                const hueSlider = el.querySelector('.cc-cp-hue');
                const hexInput  = el.querySelector('.cc-cp-hex');
                const preview   = el.querySelector('.cc-cp-preview');
                const ctx       = square.getContext('2d');

                const drawSquare = () => {
                    const w = square.width, h = square.height;
                    ctx.fillStyle = `hsl(${_hsv.h}, 100%, 50%)`;
                    ctx.fillRect(0, 0, w, h);
                    const gS = ctx.createLinearGradient(0, 0, w, 0);
                    gS.addColorStop(0, 'rgba(255,255,255,1)');
                    gS.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = gS; ctx.fillRect(0, 0, w, h);
                    const gV = ctx.createLinearGradient(0, 0, 0, h);
                    gV.addColorStop(0, 'rgba(0,0,0,0)');
                    gV.addColorStop(1, 'rgba(0,0,0,1)');
                    ctx.fillStyle = gV; ctx.fillRect(0, 0, w, h);
                    const cx = _hsv.s * w, cy = (1 - _hsv.v) * h;
                    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
                    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
                };

                const updateFromHSV = () => {
                    const hex = hsvToHex(_hsv.h, _hsv.s, _hsv.v);
                    hexInput.value = hex.toUpperCase();
                    preview.style.background = hex;
                    drawSquare();
                };

                let dragging = false;
                const moveSquare = (e) => {
                    const rect = square.getBoundingClientRect();
                    let x = (e.clientX - rect.left) / rect.width;
                    let y = (e.clientY - rect.top) / rect.height;
                    x = Math.max(0, Math.min(1, x));
                    y = Math.max(0, Math.min(1, y));
                    _hsv.s = x;
                    _hsv.v = 1 - y;
                    updateFromHSV();
                };
                square.addEventListener('mousedown', (e) => { dragging = true; moveSquare(e); });
                document.addEventListener('mousemove', (e) => { if (dragging) moveSquare(e); });
                document.addEventListener('mouseup', () => { dragging = false; });

                hueSlider.addEventListener('input', () => {
                    _hsv.h = parseFloat(hueSlider.value);
                    updateFromHSV();
                });

                hexInput.addEventListener('input', () => {
                    let v = hexInput.value.trim();
                    if (!v.startsWith('#')) v = '#' + v;
                    if (/^#[a-fA-F0-9]{6}$/.test(v)) {
                        _hsv = hexToHsv(v);
                        hueSlider.value = _hsv.h;
                        preview.style.background = v;
                        drawSquare();
                    }
                });

                el.querySelector('.cc-cp-ok').addEventListener('click', () => {
                    const hex = hsvToHex(_hsv.h, _hsv.s, _hsv.v);
                    if (_onAccept) _onAccept(hex);
                    closeFn();
                });
                el.querySelector('.cc-cp-cancel').addEventListener('click', closeFn);

                hueSlider.value = _hsv.h;
                updateFromHSV();
            }
        });
    }

    window.ColorPicker = { 
        open,
        hsvToHex,
        hexToHsv
    };
})();