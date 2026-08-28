# dsh-csv-and-image-preview

English | [中文](README.md)

Render images and SVG **for real** in the DeepSeek Harness (dsh) chat — and prepare CSV review — displayed as a native browser `<img>`, bypassing the chat renderer's markdown / genui image filter, and paired with a **preview-first workflow**: generate or modify an image, render it to you first, and only apply the real change once you confirm.

## Install

Standard Profile Bundle install (recommended):

```sh
dsh plugin --profile web add dsh-csv-and-image-preview
```

Or install the development copy from a local directory:

```sh
dsh plugin --profile web add ../dsh-csv-and-image-preview
```

After installing, restart `dsh web` so the new bundle joins the runtime. Legacy fallback for older versions: copy the package into the profile's `node_modules` and insert the `- insert: [...]` row in `cordis.patch.yml` — keep this for old-version compatibility only.

## What it does

1. **Real image rendering.** The host registers a `preview_image` tool: it reads a file path (or inline SVG), infers the MIME, base64-encodes it into a data-URI, and projects it through the tool result's `presentationMeta`. The browser-side keyed toolview (`tool.call.toolview`, key `preview_image`) reads that meta and renders a native `<img>`. The image bytes travel only through meta into the browser — **never into the model context**.
2. **Preview-first workflow.** After calling `preview_image`, the agent receives a compact summary (SVG/bitmap, dimensions, byte count) while the actual image is shown in chat; the agent then **waits for your confirmation** before writing files or applying changes.
3. **Preview any resource.** Pass a local path to preview the matching image file, or pass inline SVG text to render without writing to disk.

## Usage examples

```markdown
<!-- Preview a file on disk -->
I'll show you the preview first.
[call preview_image path=E:\DSHConfig\logo-a.svg label=ALPHA]
```

```markdown
<!-- Preview inline SVG (not yet on disk) -->
[call preview_image content=<svg ...> mime=image/svg+xml label=sketch]
```

The agent sees something like `已渲染预览「ALPHA」:SVG 矢量图(1.3 KB).` while the picture appears in the tool card.

## Convention: preview first

This plugin treats "preview, then apply" as the default behavior:

- When generating / modifying an SVG, image, or CSV, **preview it first** with `preview_image`; do not write the real file yet.
- Only after the user confirms (`确认` / `可以` / `就这样`) do you actually write / mutate.
- If the user rejects it, redo per feedback and preview again.
- To preview any resource, pass `path` directly.

To enforce this convention, pair it with the bundled agent preset (see `Agent.md`), which writes these rules into the session persona.

## Layout

```
lib/index.js   host: registers the preview_image tool; reads files and projects data-URIs
lib/client.js  browser bundle: registers the keyed toolview; renders a native <img>
cordis.patch.yml  profile insert line
```

## Development

```sh
pnpm install
pnpm build       # no-op: lib/ ships prebuilt, no transpile
pnpm prepack     # verify the packed tarball contains lib/
```

## License

MIT © [jetecho](./LICENSE). See [LICENSE](./LICENSE).
