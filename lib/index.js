/**
 * dsh-csv-and-image-preview 宿主插件。
 *
 * 单条 Loader 行(见 cordis.patch.yml)挂载本模块。职责:
 *  1. 注册 `preview_image` 工具:给定一个文件路径(或内联 SVG),读取文件、
 *     推断 MIME、base64 编码为 data-URI;
 *  2. 注册 `preview_csv` 工具:读取 CSV/TSV(磁盘路径或内联文本),嗅探分隔符、
 *     有界解析(输入体积/行数/列数/单元格四重截断),产出可序列化的表格 meta;
 *  3. 两者都把展示数据通过工具结果的 `presentationMeta` 投递出去,浏览器端
 *     键控 toolview 据此渲染原生 <img> / <table> —— 绕过聊天渲染器的过滤;
 *  4. `execute` 返回紧凑的模型可读摘要,真正的图片字节/表格数据只走 meta,
 *     不进模型上下文。
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

/** 从 args.label 取标题;空/缺省回退 fallback。 */
function labelOf(args, fallback) {
  return typeof args === 'object' && args !== null && typeof args.label === 'string' && args.label !== ''
    ? args.label
    : fallback
}

// ── 图片预览 ────────────────────────────────────────────────────────────────

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
function imageSummary(mime) {
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
  const label = labelOf(args, '预览')

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
      summary: imageSummary(mime),
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
      return { card: 'generic', title: `预览「${labelOf(args, '预览图片')}」`, kind: 'other' }
    },
    presentResult(args) {
      return { card: 'generic', title: `预览「${labelOf(args, '预览图片')}」` }
    },
  }
}

// ── CSV 预览 ────────────────────────────────────────────────────────────────

/** 候选分隔符(嗅探顺序即平局优先级)。 */
const CSV_DELIMITERS = [',', ';', '\t', '|']
/** 单次预览允许读入的最大体积,超过直接拒绝,保护宿主进程。 */
const CSV_MAX_INPUT_BYTES = 8 * 1024 * 1024
const CSV_MAX_ROWS_DEFAULT = 50
const CSV_MAX_ROWS_LIMIT = 500
const CSV_MAX_COLS = 40
const CSV_CELL_CAP = 200

function fmtBytes(n) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * 分隔符嗅探:统计前 4 KB 内引号外各候选出现次数,取最多者;全 0 回退逗号。
 * 遍历顺序即平局优先级(, ; Tab |)。
 */
function detectDelimiter(text) {
  const counts = new Map(CSV_DELIMITERS.map((d) => [d, 0]))
  let inQuotes = false
  const end = Math.min(text.length, 4096)
  for (let i = 0; i < end; i++) {
    const ch = text[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch) + 1)
  }
  let best = CSV_DELIMITERS[0]
  let bestN = -1
  for (const d of CSV_DELIMITERS) {
    const n = counts.get(d)
    if (n > bestN) { best = d; bestN = n }
  }
  return bestN > 0 ? best : ','
}

/**
 * RFC 4180 风格的有界 CSV 解析:引号字段、"" 转义、引号内换行、CRLF。
 * 只保留前 maxRows 行(有界内存),但完整统计总行数与最大列数,摘要可用。
 * 跳过空行;返回 { rows, totalRows, totalCols }。
 */
function parseCsvBounded(text, delimiter, maxRows) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let totalRows = 0
  let totalCols = 0
  const endRow = () => {
    row.push(field)
    field = ''
    if (row.length === 1 && row[0] === '') { row = []; return } // 空行不计
    if (row.length > totalCols) totalCols = row.length
    totalRows++
    if (rows.length < maxRows) rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      endRow()
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) endRow()
  return { rows, totalRows, totalCols }
}

function clampMaxRows(v) {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 1) return CSV_MAX_ROWS_DEFAULT
  return Math.min(n, CSV_MAX_ROWS_LIMIT)
}

/** 显式分隔符 → 生效值;null 表示走嗅探(.tsv 扩展名直接判 Tab)。 */
function resolveDelimiter(args) {
  const d = args.delimiter
  if (typeof d === 'string' && CSV_DELIMITERS.includes(d)) return d
  if (typeof args.path === 'string' && args.path !== '' && args.path.toLowerCase().endsWith('.tsv')) return '\t'
  return null
}

function capCell(c) {
  return c.length > CSV_CELL_CAP ? c.slice(0, CSV_CELL_CAP) + '…' : c
}

/**
 * 同步构建 CSV 预览 meta,返回 { label, delimiter, rows, totalRows, totalCols,
 * rowsShown, colsShown };有错抛 Error。rows 含表头行,已被列数/单元格截断并
 * 补齐成规则矩形,浏览器可直接渲染。
 */
function buildCsvPreviewSync(args) {
  if (typeof args !== 'object' || args === null) {
    throw new Error('preview_csv 需要对象参数(带 path 或 content)。')
  }
  const label = labelOf(args, 'CSV 预览')

  let text = ''
  if (typeof args.path === 'string' && args.path !== '') {
    const abs = resolve(args.path)
    const buf = readFileSync(abs)
    if (buf.length > CSV_MAX_INPUT_BYTES) {
      throw new Error(`文件 ${fmtBytes(buf.length)} 超过预览上限 ${fmtBytes(CSV_MAX_INPUT_BYTES)},请先截取再预览。`)
    }
    text = buf.toString('utf8')
  } else if (typeof args.content === 'string' && args.content !== '') {
    if (Buffer.byteLength(args.content, 'utf8') > CSV_MAX_INPUT_BYTES) {
      throw new Error(`内联内容超过预览上限 ${fmtBytes(CSV_MAX_INPUT_BYTES)},请先截取再预览。`)
    }
    text = args.content
  } else {
    throw new Error('preview_csv 需要 path 或 content 参数。')
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // 剥 BOM

  const auto = resolveDelimiter(args)
  const delimiter = auto ?? detectDelimiter(text)
  const parsed = parseCsvBounded(text, delimiter, clampMaxRows(args.maxRows))
  if (parsed.totalRows === 0) throw new Error('CSV 内容为空,没有可预览的数据行。')

  const colsShown = Math.min(parsed.totalCols, CSV_MAX_COLS)
  const rows = parsed.rows.map((r) => {
    const view = r.slice(0, CSV_MAX_COLS).map(capCell)
    while (view.length < colsShown) view.push('')
    return view
  })
  return {
    label,
    delimiter,
    rows,
    totalRows: parsed.totalRows,
    totalCols: parsed.totalCols,
    rowsShown: rows.length,
    colsShown,
  }
}

/** 模型可读的行列摘要(含截断信息)。 */
function csvSummaryText(r) {
  const d = r.delimiter === '\t' ? 'Tab' : r.delimiter
  let s = `CSV 表格 ${r.totalRows} 行 × ${r.totalCols} 列,分隔符 "${d}"`
  if (r.rowsShown < r.totalRows) s += `;显示前 ${r.rowsShown} 行`
  if (r.colsShown < r.totalCols) s += ` / 前 ${r.colsShown} 列`
  return s + '。'
}

/**
 * 构建 preview_csv 工具定义。模型传 CSV 路径/文本发起一次「表格预览」:
 * 宿主有界解析后把表格投递到 meta,浏览器端 toolview 渲染原生 <table>。
 */
export function createCsvTool() {
  return {
    name: 'preview_csv',
    description:
      '在聊天里预览 CSV/TSV 表格——用浏览器原生 <table> 渲染,粘性表头、控件限高局部滚动。'
      + ' 传 path 读取磁盘文件(.csv/.tsv 等),或传 content(内联 CSV 文本)。'
      + ' 分隔符自动嗅探(, ; Tab |),可用 delimiter 指定;默认只投递前 '
      + `${CSV_MAX_ROWS_DEFAULT} 行(可用 maxRows 调大,上限 ${CSV_MAX_ROWS_LIMIT})。`
      + ' 表格数据只走 meta 投递到浏览器,不进入模型上下文;返回的是行列摘要。'
      + ' 生成/修改 CSV 时先调用它给用户预览,等用户确认后再做真正的写入/修改。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要预览的 CSV/TSV 文件路径。优先用绝对路径。',
        },
        content: {
          type: 'string',
          description: '备选:内联 CSV 文本。与 path 二选一。',
        },
        delimiter: {
          type: 'string',
          enum: [...CSV_DELIMITERS],
          description: '字段分隔符;缺省时自动嗅探,.tsv 文件默认 Tab。',
        },
        maxRows: {
          type: 'number',
          description: `预览的最大行数(含表头行),默认 ${CSV_MAX_ROWS_DEFAULT},上限 ${CSV_MAX_ROWS_LIMIT}。`,
        },
        label: {
          type: 'string',
          description: '表格标题,显示在预览上方。',
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
        // 必须同步返回 lossless JSON;解析全程同步。
        try {
          return buildCsvPreviewSync(args)
        } catch {
          return null
        }
      },
    },
    async execute(args) {
      try {
        const r = buildCsvPreviewSync(args)
        return `已渲染 CSV 预览「${r.label}」:${csvSummaryText(r)}表格已显示在聊天中,等待用户确认后再做真正的修改。`
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return `preview_csv 失败:${detail}`
      }
    },
    presentCall(args) {
      return { card: 'generic', title: `CSV 预览「${labelOf(args, 'CSV 表格')}」`, kind: 'other' }
    },
    presentResult(args) {
      return { card: 'generic', title: `CSV 预览「${labelOf(args, 'CSV 表格')}」` }
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
    tools.register(createCsvTool())
    registered = true
  }
  tryRegister(undefined)
  if (typeof ctx.on === 'function') {
    ctx.on('internal/service', (name, value) => {
      if (name === 'tools') tryRegister(value)
    })
  }
}
