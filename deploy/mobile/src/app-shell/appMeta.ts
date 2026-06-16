import { buildUrl } from '../mobileStore'
import { load as loadYaml } from 'js-yaml'
import skinYmlRaw from './skin.yml?raw'

const APP_AUTHOR_AVATAR_URL = 'https://avatars.githubusercontent.com/u/47016274'
const APP_AUTHOR_AVATAR_STORAGE_KEY = 'rv_mobile_author_github_avatar'
const SKIN_ASSETS_CACHE_KEY = 'rv_mobile_skin_assets_v1'

export const DEFAULT_BACKEND = 'http://127.0.0.1:12345'
export const EDGE_LOGO_SRC = './assets/edge.png'
export const MENU_LOGO_SRC = './assets/menu.png'
export const APP_VERSION_FALLBACK = '0.1.0'
export const APP_AUTHOR = 'jsoneri'
export const DOCS_URL = 'https://rv.101114105.xyz/guide/mobile'
export const CHANGELOG_URL = 'https://rv.101114105.xyz/changelog'
export const FAQ_URL = 'https://rv.101114105.xyz/faq'
export const RELEASES_URL = 'https://github.com/jasoneri/redViewer/releases'
export const ISSUES_URL = 'https://github.com/jasoneri/redViewer/issues'
export const CURRENT_LANGUAGE_LABEL = '简体中文'

export type SkinEntry = {
  _act?: {
    edge?: [string, number?] | string
    menu?: [string, number?] | string
  }
  edge: string
  menu: string
  settings_bg: string
}

export type SkinConfig = {
  skinBaseUrl: string
  skin: Record<string, SkinEntry>
}

export type SkinAssets = {
  edgeImgSrc: string
  edgeEffectSrc: string
  edgeEffectDuration: number
  menuImgSrc: string
  menuEffectSrc: string
  menuEffectDuration: number
  settingsBottomGifSrc: string
}

export const MOBILE_SKIN_CONFIG: SkinConfig = loadYaml(skinYmlRaw) as SkinConfig
export const AVAILABLE_SKINS = Object.keys(MOBILE_SKIN_CONFIG.skin)

export const EMPTY_SKIN_ASSETS: SkinAssets = {
  edgeImgSrc: '',
  edgeEffectSrc: '',
  edgeEffectDuration: 1000,
  menuImgSrc: '',
  menuEffectSrc: '',
  menuEffectDuration: 1000,
  settingsBottomGifSrc: '',
}

export function queryParam(name: string): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name)?.trim() || ''
}

export function readStoredAuthorAvatar(): string {
  if (typeof window === 'undefined') return ''
  try {
    const value = localStorage.getItem(APP_AUTHOR_AVATAR_STORAGE_KEY) || ''
    return value.startsWith('data:image/') ? value : ''
  } catch {
    return ''
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

async function fetchAuthorAvatarDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`作者头像下载失败: ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (contentType && !contentType.startsWith('image/')) throw new Error('作者头像响应不是图片')
  return blobToDataUrl(await response.blob())
}

async function fetchImageDataUrl(url: string, label: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${label}下载失败: ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (contentType && !contentType.startsWith('image/')) throw new Error(`${label}响应不是图片`)
  return blobToDataUrl(await response.blob())
}

export async function downloadAuthorAvatarToLocalStorage(backendUrl: string): Promise<string> {
  const proxyUrl = buildUrl(backendUrl, `/root/cgs/avatar?url=${encodeURIComponent(APP_AUTHOR_AVATAR_URL)}`)
  const avatar = await fetchAuthorAvatarDataUrl(proxyUrl).catch(() => fetchAuthorAvatarDataUrl(APP_AUTHOR_AVATAR_URL))
  localStorage.setItem(APP_AUTHOR_AVATAR_STORAGE_KEY, avatar)
  return avatar
}

function resolveAssetUrl(path: string, baseUrl: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('./') || path.startsWith('assets/')) return path
  return `${baseUrl}/${path}`
}

async function resolveSkinAssets(skinId: string): Promise<SkinAssets> {
  const entry = MOBILE_SKIN_CONFIG.skin[skinId]
  if (!entry) return EMPTY_SKIN_ASSETS

  const baseUrl = `${MOBILE_SKIN_CONFIG.skinBaseUrl}/${skinId}`
  
  const edgeUrl = resolveAssetUrl(entry.edge, baseUrl)
  const menuUrl = resolveAssetUrl(entry.menu, baseUrl)
  const settingsBgUrl = resolveAssetUrl(entry.settings_bg, baseUrl)

  const actEdge = entry._act?.edge
  const [edgeEffectPath, edgeEffectDuration] = Array.isArray(actEdge) ? actEdge : [actEdge || '', 1000]
  const edgeEffectUrl = edgeEffectPath ? resolveAssetUrl(edgeEffectPath, baseUrl) : ''

  const actMenu = entry._act?.menu
  const [menuEffectPath, menuEffectDuration] = Array.isArray(actMenu) ? actMenu : [actMenu || '', 1000]
  const menuEffectUrl = menuEffectPath ? resolveAssetUrl(menuEffectPath, baseUrl) : ''

  const [edgeImgSrc, menuImgSrc, settingsBottomGifSrc, edgeEffectSrc, menuEffectSrc] = await Promise.all([
    fetchImageDataUrl(edgeUrl, `${skinId}/edge`),
    fetchImageDataUrl(menuUrl, `${skinId}/menu`),
    fetchImageDataUrl(settingsBgUrl, `${skinId}/settings_bg`),
    edgeEffectUrl ? fetchImageDataUrl(edgeEffectUrl, `${skinId}/edge_effect`).catch(() => '') : Promise.resolve(''),
    menuEffectUrl ? fetchImageDataUrl(menuEffectUrl, `${skinId}/menu_effect`).catch(() => '') : Promise.resolve(''),
  ])

  return {
    edgeImgSrc,
    edgeEffectSrc,
    edgeEffectDuration: edgeEffectDuration || 1000,
    menuImgSrc,
    menuEffectSrc,
    menuEffectDuration: menuEffectDuration || 1000,
    settingsBottomGifSrc,
  }
}

export async function warmSkinBundle(preferredSkinId: string): Promise<Record<string, SkinAssets>> {
  const bundle: Record<string, SkinAssets> = {}
  const skinIds = AVAILABLE_SKINS
  const orderedIds = [preferredSkinId, ...skinIds.filter(id => id !== preferredSkinId)]

  for (const skinId of orderedIds) {
    try {
      bundle[skinId] = await resolveSkinAssets(skinId)
    } catch (error) {
      console.warn(`Failed to resolve skin ${skinId}:`, error)
      bundle[skinId] = EMPTY_SKIN_ASSETS
    }
  }

  try {
    localStorage.setItem(SKIN_ASSETS_CACHE_KEY, JSON.stringify(bundle))
  } catch (error) {
    console.warn('Failed to save skin bundle:', error)
  }

  return bundle
}

export function readStoredSkinAssets(skinId: string): SkinAssets | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(SKIN_ASSETS_CACHE_KEY)
    if (!cached) return null
    const bundle: Record<string, SkinAssets> = JSON.parse(cached)
    return bundle[skinId] || null
  } catch {
    return null
  }
}

export function clearSkinAssetsCache(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SKIN_ASSETS_CACHE_KEY)
  } catch (error) {
    console.warn('Failed to clear skin assets cache:', error)
  }
}
