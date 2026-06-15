//! Resource management - fonts, themes, and other dynamic assets
//!
//! Resources are stored in %APPDATA%/redViewer/resources/ and loaded at runtime.
//! This allows installer to download large assets separately from the main app bundle.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

/// Get the base resources directory in AppData
pub fn get_resources_dir() -> Result<PathBuf> {
    let data_dir = dirs::data_dir().context("Failed to resolve AppData directory")?;
    let resources_dir = data_dir.join("redViewer").join("resources");
    
    // Ensure directory exists
    std::fs::create_dir_all(&resources_dir)
        .with_context(|| format!("Failed to create resources directory: {:?}", resources_dir))?;
    
    Ok(resources_dir)
}

/// Get the fonts directory
pub fn get_fonts_dir() -> Result<PathBuf> {
    let resources_dir = get_resources_dir()?;
    let fonts_dir = resources_dir.join("fonts");
    
    std::fs::create_dir_all(&fonts_dir)
        .with_context(|| format!("Failed to create fonts directory: {:?}", fonts_dir))?;
    
    Ok(fonts_dir)
}

/// Check if a font file exists in the resources directory
pub fn font_exists(font_name: &str) -> Result<bool> {
    let fonts_dir = get_fonts_dir()?;
    let font_path = fonts_dir.join(font_name);
    Ok(font_path.exists())
}

/// Get the absolute path to a font file (if it exists)
pub fn get_font_path(font_name: &str) -> Result<Option<PathBuf>> {
    let fonts_dir = get_fonts_dir()?;
    let font_path = fonts_dir.join(font_name);
    
    if font_path.exists() {
        Ok(Some(font_path))
    } else {
        Ok(None)
    }
}

/// Read a font file from the resources directory as bytes.
pub fn get_font_bytes(font_name: &str) -> Result<Option<Vec<u8>>> {
    let Some(font_path) = get_font_path(font_name)? else {
        return Ok(None);
    };

    let bytes = std::fs::read(&font_path)
        .with_context(|| format!("Failed to read font file: {:?}", font_path))?;

    Ok(Some(bytes))
}

/// List all available fonts in the resources directory
pub fn list_fonts() -> Result<Vec<String>> {
    let fonts_dir = get_fonts_dir()?;
    
    let mut fonts = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&fonts_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        // Only include font files
                        if name.ends_with(".ttf") 
                            || name.ends_with(".otf") 
                            || name.ends_with(".woff") 
                            || name.ends_with(".woff2") {
                            fonts.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    
    fonts.sort();
    Ok(fonts)
}

/// Copy a font from bundled resources to AppData (for installer use)
pub fn install_font(source: &Path, font_name: &str) -> Result<()> {
    let fonts_dir = get_fonts_dir()?;
    let dest = fonts_dir.join(font_name);
    
    std::fs::copy(source, &dest)
        .with_context(|| format!("Failed to copy font {} to {:?}", font_name, dest))?;
    
    tracing::info!("Installed font: {} -> {:?}", font_name, dest);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resources_dir() {
        let dir = get_resources_dir().unwrap();
        assert!(dir.to_string_lossy().contains("redViewer"));
    }

    #[test]
    fn test_fonts_dir() {
        let dir = get_fonts_dir().unwrap();
        assert!(dir.to_string_lossy().contains("fonts"));
    }
}
