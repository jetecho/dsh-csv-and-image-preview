/**
 * dsh-csv-and-image-preview 宿主插件。
 *
 * 单条 Loader 行(见 cordis.patch.yml)挂载本模块。职责:
 *  1. 注册 `preview_image` 工具:给定一个文件路径(或内联 SVG),读取文件、
 *     推断 MIME、base64 编码为 data-URI;
 *  2. 把该 data-URI 通过工具结果的 `presentationMeta` 投递出去,浏览器端
 *     键控 toolview 据此渲染原生 <img> —— 绕过聊天渲染器对图片的过滤;
 *  3. `execute` 返回紧凑的模型可读摘要(尺寸/字节/说明),真正的图片字节
 *     只走 meta,不进模型上下文。
 *
 * 注意:`output.presentationMeta` 必须**同步**返回 lossless JSON(它是展示
 * 期别名,在结果落地时就读取,不能返回 Promise),因此这里用同步 fs 读取;
 * `execute` 本身是 async,但内部调用同一个同步构建器。
 *
 * 不导入 cordis/dsh-* 运行时包中的 Service/Context 类:仅用 ctx API 与 Node
 * 内建能力,与宿主进程共享同一套运行时实例。
 * @module dsh-csv-and-image-preview
 */

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export const name = 'csv-and-image-preview'

/** 扩展名 → MIME 推断表。 */
const MIME_BY_EXT = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
}

/** 从路径扩得 MIME;未知回退 octet-stream。 */
function mimeOf(path) {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return MIME_BY_EXT[path.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

/** 提取内联 SVG 的 width/height(viewBox 或 attr),用于摘要。 */
function svgDimension(svg) {
  const w = /width="([0-9.]+)"/.exec(svg)
  const h = /height="([0-9.]+)"/.exec(svg)
  const vb = /viewBox="[^"]*?([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)"/.exec(svg)
  if (w && h) return `${w[1]}×${h[1]}`
  if (vb) return `${vb[3]}×${vb[4]}`
  return 'unknown'
}

/** 模型可读的单行摘要。 */
function svgSummary(mime, bytes) {
  const size = bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return mime === 'image/svg+xml' ? 'SVG 矢量图' : mime.replace('image/', '').toUpperCase() + ' 位图'
}

/**
 * 同步构建一次预览结果,返回 { src, mime, label, bytes, summary };有错抛 Error。
 * 同步是因为 `presentationMeta` 必须同步返回 lossless JSON。
 */
function buildPreviewSync(args) {
  if (typeof args !== 'object' || args === null) {
    throw new Error('preview_image 需要对象参数(带 path 或 content)。')
  }
  const label = typeof args.label === 'string' && args.label !== '' ? args.label : '预览'

  // 优先:磁盘文件路径。
  if (typeof args.path === 'string' && args.path !== '') {
    const abs = resolve(args.path)
    const mime = mimeOf(abs)
    const buf = readFileSync(abs)
    const st = statSync(abs)
    const b64 = buf.toString('base64')
    return {
      src: `data:${mime};base64,${b64}`,
      mime,
      label,
      bytes: st.size,
      summary: svgSummary(mime, st.size),
    }
  }

  // 备选:调用方直接给内容。
  if (typeof args.content === 'string' && args.content !== '') {
    const mime = args.mime === 'image/svg+xml' ? 'image/svg+xml' : (typeof args.mime === 'string' ? args.mime : 'image/svg+xml')
    if (mime === 'image/svg+xml') {
      const b64 = Buffer.from(args.content, 'utf8').toString('base64')
      return { src: `data:image/svg+xml;base64,${b64}`, mime, label, bytes: b64.length, summary: `inline SVG ${svgDimension(args.content)}` }
    }
    // 假定 content 已是 base64。
    return { src: `data:${mime};base64,${args.content}`, mime, label, bytes: args.content.length, summary: `inline ${mime}` }
  }

  throw new Error('preview_image 需要 path 或 content 参数。')
}

/**
 * 构建 preview_image 工具定义。注册进工具注册表后,模型可用它发起一次
 * “预览”:宿主读取图片并投递 data-URI 到 meta,浏览器端 toolview 渲染。
 */
export function createPreviewTool() {
  return {
    name: 'preview_image',
    description:
      '在聊天里预览一张图片或 SVG——用浏览器原生 <img> 渲染,绕过聊天渲染器对图片的过滤。'
      + ' 传 path 读取磁盘文件,或传 content(内联 SVG 文本)直接预览。'
      + ' 图片字节只走 meta 投递到浏览器,不进入模型上下文;返回的是紧凑摘要。'
      + ' 生成/修改图片时先调用它给用户预览,等用户确认后再做真正的写入/修改。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要预览的图片文件路径(.svg/.png/.jpg/.gif/.webp 等)。优先用绝对路径。',
        },
        content: {
          type: 'string',
          description: '备选:内联 SVG 文本(或 base64 内容)。与 path 二选一。',
        },
        mime: {
          type: 'string',
          description: '当用 content 且非 SVG 时,指定内容 MIME(如 image/png)。',
        },
        label: {
          type: 'string',
          description: '图片标题,显示在预览上方。',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string', description: '单行预览摘要,给模型看。' },
      render(_args, value) {
        return [{ type: 'text', text: String(value) }]
      },
      presentationMeta(args) {
        // 必须同步返回 lossless JSON(genui 的 render_ui 正是如此:从 args 直接推导)。
        try {
          const r = buildPreviewSync(args)
          return { src: r.src, mime: r.mime, label: r.label }
        } catch {
          return null
        }
      },
    },
    async execute(args) {
      try {
        const r = buildPreviewSync(args)
        return `已渲染预览「${r.label}」:${r.summary}(${r.bytes} B)。图片已显示在聊天中,等待用户确认后再做真正的修改。`
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return `preview_image 失败:${detail}`
      }
    },
    presentCall(args) {
      const label = typeof args === 'object' && args !== null && typeof args.label === 'string' && args.label !== '' ? args.label : '预览图片'
      return { card: 'generic', title: `预览「${label}」`, kind: 'other' }
    },
    presentResult(args) {
      const label = typeof args === 'object' && args !== null && typeof args.label === 'string' && args.label !== '' ? args.label : '预览图片'
      return { card: 'generic', title: `预览「${label}」` }
    },
  }
}

/**
 * 注册工具。`tools` 服务可能晚于本插件绑定(启动顺序),因此既在 apply 时
 * 探测一次,也订阅 `internal/service`(cordis 在每次服务绑定时发出),确保
 * 一旦工具注册表出现就立即注册。
 */
export function apply(ctx) {
  let registered = false
  const tryRegister = (value) => {
    if (registered) return
    const tools = value ?? ctx.reflect.get('tools', false)
    if (tools === undefined) return
    tools.register(createPreviewTool())
    registered = true
  }
  tryRegister(undefined)
  if (typeof ctx.on === 'function') {
    ctx.on('internal/service', (name, value) => {
      if (name === 'tools') tryRegister(value)
    })
  }
}
