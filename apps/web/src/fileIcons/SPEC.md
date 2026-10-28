---
id: submodule-web-file-icons
type: submodule-design
status: active
title: fileIcons — local file and directory icon presentation
parent: module-web
tags: [ui, icons]
---

## Responsibility and boundary

Props-driven file and folder icons for the Files panel, shared by All and Changed views.
`index.ts` exports `FileTypeIcon` and `FolderTypeIcon`. Dependencies are React, Lucide,
`@thinkrail/ui/utils` and generated local data only; no store, transport, filesystem or network lookup.
Icon identity never selects an editor, changes a path or changes Git status.

Material Icon Theme 5.40.0 (MIT) supplies filename, compound-extension and semantic-directory
associations. `scripts/generate-file-icons.ts` reads the pinned dev dependency and emits the maps,
static SVG URL imports and the distributed license. The package's generator never enters the browser.
Vite emits referenced SVGs as local hashed assets; images load only when rendered. No CDN or remote
icon service receives project paths, and there is no inline SVG/HTML injection.

Matching is case-insensitive, accepts Windows separators, and prefers the longest matching path suffix
for named files/folders before checking a file's longest compound extension. Folder icons follow the
expanded state, including compact chains (resolved deepest path). Unknown files use Lucide File;
unknown directories use Lucide Folder / FolderOpen. Git status remains on labels and status marks,
not on the colored artwork. Icons are decorative, 16px, non-draggable, and do not alter row names.
The active theme's `data-theme-appearance` selects upstream light variants via CSS, including custom
and high-contrast themes; no separate theme subscription or persisted icon preference is introduced.

`file-icons:check` rejects stale generated data, missing SVG references and license drift. Resolver
unit tests cover precedence, special filenames, supported types, folder expansion, Windows paths and
unknown/prototype-like names. Browser tests cover image loading, theme changes and existing row actions.
