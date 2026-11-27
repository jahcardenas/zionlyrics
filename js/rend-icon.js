import { createIcons, icons } from 'lucide';

// 1. Función local
export function initIcons() {
    createIcons({ icons });
}

// 2. Exponerlo al ámbito global del navegador/Electron
window.createIcons = () => {
    createIcons({ icons });
};
