import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const openBrowserBtn = document.getElementById('open-browser-btn');
const btnText = document.getElementById('btn-text');
const infoText = document.getElementById('info-text');

// Translations (injected by Rust via window.__TRANSLATIONS__)
const translations = window.__TRANSLATIONS__ || {
    "button_read": "Read",
    "tray_info": "App is running in system tray. Click to start reading."
};

btnText.textContent = translations.button_read;
infoText.textContent = translations.tray_info;

// Cancel auto-close on any user interaction
document.body.addEventListener('click', () => {
    invoke('guide_cancel_auto_close');
});

document.body.addEventListener('keydown', () => {
    invoke('guide_cancel_auto_close');
});

openBrowserBtn.addEventListener('click', () => {
    invoke('guide_open_browser').catch(console.error);
});

// Listen for the 'guide-close' event from Rust to trigger animation
listen('guide-close', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.2s ease-out';
});

// Theme handling - CSS media query only
function applyTheme() {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function setTheme(isDark) {
        if (isDark) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
    }

    // Initial theme
    setTheme(darkQuery.matches);

    // Listen for changes
    darkQuery.addEventListener('change', (e) => setTheme(e.matches));
}

applyTheme();
