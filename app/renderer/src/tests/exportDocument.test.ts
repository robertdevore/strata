import { expect, it } from 'vitest'
import { exportDocumentSchema, exportDocumentUrl } from '../../../main/security/exportDocument'

it('bounds auxiliary document input and puts the restrictive policy before caller HTML', () => {
  expect(() => exportDocumentSchema.parse({ html: '' })).toThrow()
  expect(() => exportDocumentSchema.parse({ html: 'x'.repeat(8 * 1024 * 1024 + 1) })).toThrow()
  expect(() => exportDocumentSchema.parse({ html: '<p>note</p>', url: 'file:///private' })).toThrow()
  const html = '<!doctype html><html><head><base href="https://example.com"></head><body>Note</body></html>'
  const document = decodeURIComponent(
    exportDocumentUrl(exportDocumentSchema.parse({ html }).html).split(',')[1],
  )
  expect(document.indexOf('Content-Security-Policy')).toBeLessThan(document.indexOf('<base'))
  expect(document).toContain("default-src 'none'")
  expect(document).toContain("base-uri 'none'")
  expect(document).toContain('img-src data:')
  expect(document.endsWith(html)).toBe(true)
})
