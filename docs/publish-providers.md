# Desktop HTML publishing

The HTML option in desktop Export / Publish writes an HTML file to a directory chosen through the native folder picker. It does not run shell commands or deploy to a remote provider. The old `window.strata.shell.run` capability has been removed.

The folder selection authorizes its canonical filesystem directory for the current application session. The write uses that canonical path, so changing the originally selected alias after validation does not redirect the file. Files are created exclusively: an existing file is never overwritten. If the name already exists, choose another title or destination.

Input is bounded to a 4,096-character destination, a 500-character title and 8,388,608 HTML characters. Filenames remove path separators, forbidden characters and control characters, prefix common Windows device names and fit within 246 UTF-8 bytes including the extension. Long titles are shortened only for the filename; note contents are unchanged.

Publishing writes the supplied rendered HTML to disk. PDF and print are separate operations with a restrictive embedded content policy, JavaScript disabled and no remote or local-file resource loading. See [Security Policy](../SECURITY.md) for the shared desktop boundaries.

The [earlier provider design](history/publish-providers.md) is retained as historical context. Its shell-based adapters are not part of the current application.
