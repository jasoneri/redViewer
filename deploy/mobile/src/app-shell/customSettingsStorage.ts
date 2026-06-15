/**
 * Centralized custom settings localStorage management.
 * Defines which keys are cleared on "restore settings" and which are preserved.
 */

// localStorage keys that will be cleared on restore
const CLEARABLE_KEYS = [
  'rv_mobile_backend_url',
  'rv_mobile_backend_url_history',
  'rootSecret',
  'rv_mobile_reader_settings',
  'rv_mobile_reader_floating_control_position',
  'rv_mobile_delete_mode',
  'rv_mobile_cgs_submit_position',
  'rv_mobile_cgs_mcp_llm',
  'rv_mobile_cgs_mcp_prompt_history',
  'redviewer:cgs-proxy-history',
  'rv_mobile_author_github_avatar',
  'rv_mobile_edge_img',
  'rv_mobile_menu_img',
  'rv_mobile_settings_bottom_gif',
  'rv_mobile_selected_skin',
] as const

// localStorage keys that are NEVER cleared (preserved identity/sync keys)
const PRESERVED_KEYS = [
  'rv_mobile_device_id',
] as const

/**
 * Restore custom settings by clearing registered localStorage keys.
 * Preserves device identity and does not touch IndexedDB offline cache.
 */
export function restoreCustomSettingsStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  CLEARABLE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn(`Failed to remove localStorage key: ${key}`, error)
    }
  })
}

/**
 * Clear all downloaded skin image caches from localStorage.
 */
export function clearSkinImageCaches(): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  const skinImageKeys = [
    'rv_mobile_author_github_avatar',
    'rv_mobile_edge_img',
    'rv_mobile_menu_img',
    'rv_mobile_settings_bottom_gif',
  ]

  skinImageKeys.forEach((key) => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn(`Failed to clear skin image cache: ${key}`, error)
    }
  })
}

/**
 * Get the selected skin ID from localStorage.
 */
export function getSelectedSkinId(): string {
  if (typeof window === 'undefined') return 'default'
  try {
    return localStorage.getItem('rv_mobile_selected_skin') || 'default'
  } catch {
    return 'default'
  }
}

/**
 * Save the selected skin ID to localStorage.
 */
export function setSelectedSkinId(skinId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('rv_mobile_selected_skin', skinId)
  } catch (error) {
    console.warn('Failed to save selected skin ID', error)
  }
}
