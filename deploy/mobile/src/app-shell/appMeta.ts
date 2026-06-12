import { buildUrl } from '../mobileStore'

const APP_AUTHOR_AVATAR_URL = 'https://avatars.githubusercontent.com/u/47016274'
const APP_AUTHOR_AVATAR_STORAGE_KEY = 'rv_mobile_author_github_avatar'

export const DEFAULT_BACKEND = 'http://127.0.0.1:12345'
export const EDGE_LOGO_SRC = './assets/edge.png'
export const APP_VERSION_FALLBACK = '0.1.0'
export const APP_AUTHOR = 'jsoneri'
export const DOCS_URL = 'https://rv.101114105.xyz/'
export const CHANGELOG_URL = 'https://rv.101114105.xyz/changelog'
export const FAQ_URL = 'https://rv.101114105.xyz/faq'
export const RELEASES_URL = 'https://github.com/jasoneri/redViewer/releases'
export const ISSUES_URL = 'https://github.com/jasoneri/redViewer/issues'
export const CURRENT_LANGUAGE_LABEL = '简体中文'

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
    reader.onerror = () => reject(new Error('作者头像读取失败'))
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

export async function downloadAuthorAvatarToLocalStorage(backendUrl: string): Promise<string> {
  const proxyUrl = buildUrl(backendUrl, `/root/cgs/avatar?url=${encodeURIComponent(APP_AUTHOR_AVATAR_URL)}`)
  const avatar = await fetchAuthorAvatarDataUrl(proxyUrl).catch(() => fetchAuthorAvatarDataUrl(APP_AUTHOR_AVATAR_URL))
  localStorage.setItem(APP_AUTHOR_AVATAR_STORAGE_KEY, avatar)
  return avatar
}
