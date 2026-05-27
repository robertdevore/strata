# Publish Providers & SSG Integration

Strata includes a publish provider system that lets you export notes to various destinations — local HTML files, static site generators, and (in the future) platforms like GitLab Pages, GitHub Gist, and Typefully.

## Quick Start: Local HTML Export

1. Open any note in Strata
2. Click the **Upload icon** (↑) in the editor footer row
3. Click **"Choose Folder & Publish"**
4. Select a destination folder
5. The note is rendered as a self-contained HTML file with light/dark theme CSS

The published file is fully standalone — it includes inline CSS and renders correctly with `prefers-color-scheme`.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd+Shift+B** | Toggle sidebar open/closed |

## Provider Architecture

The publish system is built around the `PublishProvider` interface (`integrations/publish/PublishProvider.ts`):

```ts
interface PublishProvider {
  id: string                    // Unique provider identifier
  displayName: string           // Human-readable name
  description: string           // Shown in the publish modal
  requiresDestination: boolean  // Whether a folder picker is needed
  publish(note, context): Promise<PublishResult>
  postPublish?(path): Promise<PublishResult>  // Optional post-publish hook
}
```

### Built-in Providers

| Provider | ID | Description |
|----------|-----|-------------|
| Local HTML | `local-html` | Exports note as styled HTML file to a chosen folder |
| Dummy (no-op) | `dummy` | Placeholder — shown when no real provider is configured |

## SSG Integration (Post-Publish Hook)

The `postPublish` hook runs AFTER the file is written. This is where you trigger a static site generator build.

### How It Works

The publish system exposes a shell command API:

```ts
window.strata.shell.run({ command: 'ssg build', cwd: '/path/to/site' })
```

When a publish provider calls this after writing files, Strata executes the command in a child process (30-second timeout) and returns stdout/stderr.

### Example: Custom SSG Workflow

To integrate your own SSG:

1. Create a new provider class implementing `PublishProvider`
2. In the `publish()` method, write your note to the SSG's content directory
3. In the `postPublish()` method, run the build command:

```ts
export class MySsgProvider implements PublishProvider {
  id = 'my-ssg'
  displayName = 'My SSG'
  description = 'Publish to my custom static site generator.'
  requiresDestination = true

  async publish(note, context) {
    // Write the HTML/MD file to the SSG content dir
    const contentPath = path.join(context.destination, 'content', 'notes')
    await fs.writeFile(path.join(contentPath, slug + '.md'), note.content)
    return { success: true, message: 'Written to content dir', path: contentPath }
  }

  async postPublish(publishedPath) {
    // Trigger the SSG build
    const result = await window.strata.shell.run({
      command: 'ssg build',
      cwd: context.destination,
    })
    return result.success
      ? { success: true, message: 'Build completed:\n' + result.stdout }
      : { success: false, message: 'Build failed:\n' + result.stderr }
  }
}
```

### Supported SSGs

The shell API works with any command-line SSG:

```bash
ssg build        # Ruff SSG
npm run build    # Astro, Next.js, VitePress
hugo             # Hugo
pelican          # Pelican
make html        # Sphinx
npx eleventy     # 11ty
```

### Local API Boundary

`shell.run` is exposed via preload IPC (`window.strata.shell.run`) and is not available on the local HTTP notes API.

## IPC / Preload API

For provider implementations that run in the main process:

```ts
// Select a folder via native dialog
const folder = await window.strata.publish.selectFolder()

// Write an HTML file
const result = await window.strata.publish.htmlFile({
  destination: folder,
  title: 'My Note',
  html: '<h1>My Note</h1>...',
})

// Run a shell command (SSG build, etc.)
const build = await window.strata.shell.run({
  command: 'ssg build',
  cwd: '/path/to/site',
})
```

## Future Provider Ideas

The provider interface is designed to support:

- **GitLab Pages** — Write to a repo folder, commit + push
- **GitHub Gist** — Create/update a gist with rendered HTML
- **Typefully** — Format and post to social media
- **Markdown export** — Plain `.md` file with frontmatter
- **Static site folder** — Write to `content/` directories for Hugo, Astro, etc.

## Security

- Shell commands run in a child process with a 30-second timeout
- The command and working directory are validated via Zod schema
- Commands are executed with `exec`, so command strings are shell-interpreted
- Treat `window.strata.shell.run` as a privileged local capability and pass only trusted, fixed command strings
- Prefer provider-owned command templates (not arbitrary user input) for safer operation
