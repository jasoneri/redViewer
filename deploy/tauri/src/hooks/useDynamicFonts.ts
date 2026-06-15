import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type FontLoadStatus = 'loading' | 'loaded' | 'error' | 'missing';

export interface FontInfo {
  name: string;
  path: string | null;
  status: FontLoadStatus;
}

const FONT_FAMILY_ALIASES: Record<string, string> = {
  ZCOOLKuaiLe: 'ZCOOL KuaiLe',
};

const FONT_WEIGHT_ALIASES: Record<string, string> = {
  thin: '100',
  extralight: '200',
  ultralight: '200',
  light: '300',
  regular: '400',
  normal: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: '700',
  extrabold: '800',
  ultrabold: '800',
  black: '900',
};

function parseFontFaceDescriptor(fontName: string) {
  const nameWithoutExtension = fontName.replace(/\.(ttf|otf|woff2?)$/i, '');
  const parts = nameWithoutExtension.split(/[-_\s]+/).filter(Boolean);
  const familyParts = [...parts];
  let weight = '400';
  let style = 'normal';

  const maybeStyle = familyParts.at(-1)?.toLowerCase();
  if (maybeStyle === 'italic') {
    style = 'italic';
    familyParts.pop();
  }

  const maybeWeight = familyParts.at(-1)?.toLowerCase();
  if (maybeWeight && FONT_WEIGHT_ALIASES[maybeWeight]) {
    weight = FONT_WEIGHT_ALIASES[maybeWeight];
    familyParts.pop();
  }

  const compactFamily = familyParts.join('');
  const family = FONT_FAMILY_ALIASES[compactFamily] ?? familyParts.join(' ');

  return {
    family: family || nameWithoutExtension,
    weight,
    style,
  };
}

function getFontFormat(fontName: string) {
  const ext = fontName.split('.').pop()?.toLowerCase();

  if (ext === 'woff') return 'woff';
  if (ext === 'woff2') return 'woff2';
  if (ext === 'otf') return 'opentype';

  return 'truetype';
}

function getBundledFontUrl(fontName: string) {
  return new URL(`./fonts/${fontName}`, document.baseURI).href;
}

function fontBytesToBuffer(bytes: number[]) {
  const fontData = new Uint8Array(bytes);

  return fontData.buffer.slice(
    fontData.byteOffset,
    fontData.byteOffset + fontData.byteLength,
  );
}

/**
 * Load fonts from AppData resources directory
 * 
 * Fonts are stored in %APPDATA%/redViewer/resources/fonts/
 * This allows installer to download large font files separately.
 */
export function useDynamicFonts(fonts: readonly string[]) {
  const [fontStatuses, setFontStatuses] = useState<Map<string, FontInfo>>(new Map());
  const [allLoaded, setAllLoaded] = useState(false);

  useEffect(() => {
    const loadFonts = async () => {
      const statuses = new Map<string, FontInfo>();

      for (const fontName of fonts) {
        try {
          let source: string | ArrayBuffer = getBundledFontUrl(fontName);
          let sourcePath = source;

          try {
            const fontBytes = await invoke<number[] | null>('get_font_bytes', { fontName });
            if (fontBytes) {
              source = fontBytesToBuffer(fontBytes);
              sourcePath = `appdata:${fontName}`;
            }
          } catch (error) {
            console.warn(`Font resource read failed, using bundled fallback: ${fontName}`, error);
          }
          const format = getFontFormat(fontName);

          const fontDescriptor = parseFontFaceDescriptor(fontName);

          // Create @font-face rule
          const fontSource = typeof source === 'string'
            ? `url("${source}") format("${format}")`
            : source;
          const fontFace = new FontFace(fontDescriptor.family, fontSource, {
            weight: fontDescriptor.weight,
            style: fontDescriptor.style,
            display: 'swap',
          });

          // Load the font
          await fontFace.load();
          document.fonts.add(fontFace);

          statuses.set(fontName, {
            name: fontName,
            path: sourcePath,
            status: 'loaded',
          });

          console.log(`✅ Font loaded: ${fontName} -> ${fontDescriptor.family}`);
        } catch (error) {
          statuses.set(fontName, {
            name: fontName,
            path: null,
            status: 'error',
          });
          console.error(`❌ Failed to load font: ${fontName}`, error);
        }
      }

      setFontStatuses(statuses);
      setAllLoaded(Array.from(statuses.values()).every((f) => f.status === 'loaded'));
    };

    void loadFonts();
  }, [fonts]);

  return {
    fontStatuses,
    allLoaded,
    getFontStatus: (fontName: string) => fontStatuses.get(fontName),
  };
}

/**
 * Get fonts directory path
 */
export async function getFontsDir(): Promise<string> {
  return await invoke<string>('get_fonts_dir');
}

/**
 * List all available fonts in AppData
 */
export async function listAvailableFonts(): Promise<string[]> {
  return await invoke<string[]>('list_fonts');
}
