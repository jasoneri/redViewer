const LOCAL_HTTP_HOSTS = new Set(['127.0.0.1', 'localhost'])

const DEFAULT_ORIGINS = {
  IMG: 'https://img-cgs.101114105.xyz',
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function isLocalHttpUrl(url) {
  return url.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(url.hostname)
}

function readEnvValue(env, key) {
  const value = env[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function parseAbsoluteUrl(rawValue, key) {
  try {
    return new URL(rawValue)
  } catch (error) {
    throw new Error(`${key} must be an absolute URL.`)
  }
}

function normalizeOrigin(rawValue, key) {
  const url = parseAbsoluteUrl(rawValue, key)
  if (url.protocol !== 'https:' && !isLocalHttpUrl(url)) {
    throw new Error(`${key} must use https unless pointing to localhost or 127.0.0.1.`)
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`${key} must not include path, query, or hash.`)
  }
  return trimTrailingSlash(url.origin)
}

export const PLACEHOLDERS = {
  URL_IMG: '{{URL_IMG}}',
}

export function createDocsUrlConfig(env) {
  const ORIGINS = {
    IMG: normalizeOrigin(readEnvValue(env, 'DOCS_IMG_ORIGIN') ?? DEFAULT_ORIGINS.IMG, 'DOCS_IMG_ORIGIN'),
  }

  const PLACEHOLDER_MAP = {
    [PLACEHOLDERS.URL_IMG]: ORIGINS.IMG,
  }

  return {
    ORIGINS,
    PLACEHOLDERS,
    PLACEHOLDER_MAP,
  }
}
