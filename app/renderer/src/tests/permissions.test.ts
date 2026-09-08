import { describe, expect, it, vi } from 'vitest'
import { installPermissionPolicy } from '../../../main/security/permissions'

const fixture = () => {
  const rendererUrl = 'file:///application/index.html'
  const contents = { getURL: vi.fn(() => rendererUrl) } as unknown as Electron.WebContents
  const session = { setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn() }
  installPermissionPolicy(session, () => contents, rendererUrl)
  const check = session.setPermissionCheckHandler.mock.calls[0][0] as NonNullable<
    Parameters<Electron.Session['setPermissionCheckHandler']>[0]
  >
  const request = session.setPermissionRequestHandler.mock.calls[0][0] as NonNullable<
    Parameters<Electron.Session['setPermissionRequestHandler']>[0]
  >
  const details = { isMainFrame: true, requestingUrl: rendererUrl }
  return { contents, check, request, details }
}

describe('desktop permission policy', () => {
  it('allows only audio and sanitized clipboard writes from the app main frame', () => {
    const { contents, check, request, details } = fixture()
    expect(check(contents, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(true)
    expect(check(contents, 'clipboard-sanitized-write', 'file://', details)).toBe(true)
    const callback = vi.fn()
    request(contents, 'media', callback, { ...details, mediaTypes: ['audio'] })
    expect(callback).toHaveBeenLastCalledWith(true)
    for (const mediaTypes of [undefined, [], ['video'], ['audio', 'video']] as const) {
      request(contents, 'media', callback, {
        ...details,
        mediaTypes: mediaTypes ? [...mediaTypes] : undefined,
      })
      expect(callback).toHaveBeenLastCalledWith(false)
    }
    for (const permission of [
      'geolocation',
      'notifications',
      'clipboard-read',
      'fileSystem',
      'openExternal',
    ] as const) {
      expect(check(contents, permission, 'file://', details)).toBe(false)
      request(contents, permission, callback, details)
      expect(callback).toHaveBeenLastCalledWith(false)
    }
    for (const mediaType of ['video', 'unknown', undefined] as const) {
      expect(check(contents, 'media', 'file://', { ...details, mediaType })).toBe(false)
    }
  })

  it('rejects foreign windows, child frames, missing URLs and unexpected file documents', () => {
    const { contents, check, request, details } = fixture()
    const callback = vi.fn()
    for (const invalid of [
      { ...details, isMainFrame: false },
      { ...details, requestingUrl: '' },
      { ...details, requestingUrl: 'file:///application/other.html' },
      { ...details, requestingUrl: 'https://example.com' },
    ]) {
      expect(check(contents, 'media', 'file://', { ...invalid, mediaType: 'audio' })).toBe(false)
      request(contents, 'media', callback, { ...invalid, mediaTypes: ['audio'] })
      expect(callback).toHaveBeenLastCalledWith(false)
    }
    expect(check(null, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(false)
    const other = { getURL: () => details.requestingUrl } as Electron.WebContents
    request(other, 'media', callback, { ...details, mediaTypes: ['audio'] })
    expect(callback).toHaveBeenLastCalledWith(false)
    vi.mocked(contents.getURL).mockReturnValue('file:///application/unexpected.html')
    expect(check(contents, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(false)
  })
})
