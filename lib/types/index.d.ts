/**
 * Public type surface for the dsh-csv-and-image-preview host half.
 * The runtime is plain JS; these declarations describe the cordis plugin
 * contract so TS consumers and the `.d.ts` re-export resolve cleanly.
 */

/** The `preview_image` tool definition (a dsh ToolDefinition object). */
export interface PreviewToolDefinition {
  name: 'preview_image'
  description: string
  parameters: Record<string, unknown>
  output: Record<string, unknown>
  execute(args: unknown): Promise<string>
  presentCall(args: unknown): { card: string; title: string; kind: string } | undefined
  presentResult(args: unknown): { card: string; title: string } | undefined
}

/** Cordis plugin exported by the host half (lib/index.js). */
export interface ImagePreviewPlugin {
  readonly name: 'csv-and-image-preview'
  apply(ctx: unknown): void
}

/** A keyed display image payload carried on tool result meta. */
export interface PreviewMeta {
  src: string
  mime: string
  label: string
}

declare const plugin: ImagePreviewPlugin
export default plugin
