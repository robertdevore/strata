export const safeExternalUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export const protectNavigation = (
  contents: Electron.WebContents,
  openExternal?: (url: string) => Promise<void>,
): void => {
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.on('will-redirect', (event) => event.preventDefault())
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternalUrl(url)
    if (safe && openExternal) void openExternal(safe).catch(() => {})
    return { action: 'deny' }
  })
}
