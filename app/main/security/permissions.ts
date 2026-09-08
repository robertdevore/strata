/** Device access is reserved for the application main frame, never exports or child frames. */
export const installPermissionPolicy = (
  session: Pick<Electron.Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  getMainContents: () => Electron.WebContents | null,
  rendererUrl: string,
): void => {
  const isTrusted = (
    contents: Electron.WebContents | null,
    details: { isMainFrame: boolean; requestingUrl?: string },
  ): boolean => {
    if (!contents || contents !== getMainContents() || !details.isMainFrame) return false
    try {
      const requested = new URL(details.requestingUrl ?? '')
      const loaded = new URL(contents.getURL())
      requested.hash = ''
      loaded.hash = ''
      return requested.href === rendererUrl && loaded.href === rendererUrl
    } catch {
      return false
    }
  }

  session.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (!isTrusted(contents, details)) return false
    return (
      permission === 'clipboard-sanitized-write' || (permission === 'media' && details.mediaType === 'audio')
    )
  })
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!isTrusted(contents, details)) return callback(false)
    const audioOnly =
      'mediaTypes' in details &&
      Array.isArray(details.mediaTypes) &&
      details.mediaTypes.length > 0 &&
      details.mediaTypes.every((type) => type === 'audio')
    callback(permission === 'clipboard-sanitized-write' || (permission === 'media' && audioOnly))
  })
}
