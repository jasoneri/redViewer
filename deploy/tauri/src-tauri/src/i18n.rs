//! Internationalization (i18n) support for redViewer
//!
//! Provides centralized i18n functionality for all modules including
//! main window, tray menus, and other UI components.

// i18n translations embedded at compile time
const I18N_ZH_CN: &str = include_str!("../i18n/zh-CN.json");
const I18N_EN_US: &str = include_str!("../i18n/en-US.json");

/// Get i18n injection script based on system locale
/// Returns JavaScript code to inject translations into window.__TRANSLATIONS__
pub fn get_i18n_script() -> String {
    let locale = get_system_locale();
    let json = match locale.as_str() {
        l if l.starts_with("zh") => I18N_ZH_CN,
        _ => I18N_EN_US,
    };
    format!(r#"window.__TRANSLATIONS__ = {};"#, json)
}

/// Get translated text by key based on system locale
pub fn get_i18n_text(key: &str) -> String {
    let locale = get_system_locale();
    let json_str = match locale.as_str() {
        l if l.starts_with("zh") => I18N_ZH_CN,
        _ => I18N_EN_US,
    };
    
    // Parse JSON and get the value
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
        if let Some(text) = json.get(key).and_then(|v| v.as_str()) {
            return text.to_string();
        }
    }
    
    // Fallback to key name
    key.to_string()
}

/// Detect system locale
fn get_system_locale() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        unsafe extern "system" {
            fn GetUserDefaultLocaleName(lpLocaleName: *mut u16, cchLocaleName: i32) -> i32;
        }

        let mut buf = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH
        let len = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
        if len > 0 {
            let os_string = OsString::from_wide(&buf[..len as usize - 1]);
            return os_string.to_string_lossy().to_string();
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("defaults")
            .args(["read", "-g", "AppleLocale"])
            .output()
        {
            if output.status.success() {
                let locale = String::from_utf8_lossy(&output.stdout);
                return locale.trim().replace('_', "-");
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(lang) = std::env::var("LANG") {
            let locale = lang.split('.').next().unwrap_or("en-US");
            return locale.replace('_', "-");
        }
    }

    "en-US".to_string()
}