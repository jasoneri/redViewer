const CLEARABLE_KEYS = [
  'rv_mobile_backend_url',
  'rv_mobile_backend_url_history',
  'rootSecret',
  'rv_mobile_reader_settings',
  'rv_mobile_reader_floating_control_position',
  'rv_mobile_delete_mode',
  'rv_mobile_cgs_submit_position',
  'rv_mobile_multicheck_float_position',
  'rv_mobile_cgs_mcp_llm',
  'rv_mobile_cgs_mcp_prompt_history',
  'redviewer:cgs-mcp-baseurl-history',
  'redviewer:cgs-mcp-model-history',
  'redviewer:cgs-mcp-preference-tags',
  'redviewer:cgs-proxy-history',
  'rv_mobile_author_github_avatar',
  'rv_mobile_skin_assets',
  'rv_mobile_selected_skin',
] as const

const PRESERVED_KEYS = [
  'rv_mobile_device_id',
] as const

export const CUSTOM_SETTINGS_RESTORED_EVENT = 'rv-mobile:custom-settings-restored'

export function restoreCustomSettingsStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  CLEARABLE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn(`Failed to remove localStorage key: ${key}`, error)
    }
  })
  window.dispatchEvent(new Event(CUSTOM_SETTINGS_RESTORED_EVENT))
}

export function clearSkinAssetsCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    localStorage.removeItem('rv_mobile_skin_assets')
  } catch (error) {
    console.warn('Failed to clear skin assets cache:', error)
  }
}

export function getSelectedSkinId(): string {
  if (typeof window === 'undefined') return 'default'
  try {
    return localStorage.getItem('rv_mobile_selected_skin') || 'default'
  } catch {
    return 'default'
  }
}

export function setSelectedSkinId(skinId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('rv_mobile_selected_skin', skinId)
  } catch (error) {
    console.warn('Failed to save selected skin ID', error)
  }
}
