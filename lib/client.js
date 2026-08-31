/**
 * dsh-csv-and-image-preview 浏览器端 bundle(单文件,经 __ModuleLoader__ 加载)。
 *
 * 为两个工具注册键控 toolview(`tool.call.toolview`, key = 工具名):
 *  - `preview_image`:从结果节点 meta 读取 { src, mime, label },渲染浏览器
 *    原生 <img>;
 *  - `preview_csv`:从结果节点 meta 读取 { label, delimiter, rows, ... },
 *    渲染原生 <table>(粘性表头、控件限高 320px 局部滚动、表头点击排序)。
 *
 * 这样图片/表格都不经过聊天渲染器的 markdown/genui 白名单,直接以真实 DOM
 * 显示。样式使用 --dsw-* 主题变量,跟随全局亮/暗主题。
 * @module dsh-csv-and-image-preview/client
 */

window.__ModuleLoader__.load({
  id: '@jetecho/dsh-csv-and-image-preview',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    // ── 样式 ────────────────────────────────────────────────────────────────
    const css = [
      '/* dsh-csv-and-image-preview */',
      '.dip-root{display:flex;flex-direction:column;gap:6px;align-items:flex-start;max-width:100%}',
      '.dip-label{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:20px}',
      '.dip-figure{margin:0;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);max-width:100%}',
      '.dip-img{display:block;max-width:100%;height:auto;border-radius:8px}',
      '.dip-img.svg{background:#fff}',
      '.dip-missing{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '/* preview_csv 表格:控件限高,内部滚动,不撑爆聊天卡片 */',
      '.dip-table-wrap{max-height:320px;max-width:100%;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px}',
      '.dip-table{border-collapse:separate;border-spacing:0;font-size:12px;line-height:20px;white-space:nowrap}',
      '.dip-table th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-weight:600;text-align:left;cursor:pointer;user-select:none;-webkit-user-select:none}',
      '.dip-table th,.dip-table td{padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);overflow:hidden;text-overflow:ellipsis}',
      '.dip-table th:last-child,.dip-table td:last-child{border-right:none}',
      '.dip-table tbody tr:nth-child(even) td{background:rgba(127,127,127,0.08)}',
      '.dip-table td.num{text-align:right;font-variant-numeric:tabular-nums}',
      '.dip-csv-note{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:18px}',
    ].join('\n')
    if (typeof document !== 'undefined') {
      const key = 'dip-' + 'dsh-csv-and-image-preview'
      if (document.querySelector('style[data-plugin-css="' + key + '"]') === null) {
        const el = document.createElement('style')
        el.dataset.plugin = 'dsh-csv-and-image-preview'
        el.dataset.pluginCss = key
        el.textContent = css
        document.head.appendChild(el)
      }
    }

    /** 从 props.block 取 meta;工具调用 running 或回退时 meta 不存在。 */
    function metaOf(props) {
      const block = props && props.block
      return block !== null && typeof block === 'object' && 'meta' in block ? block.meta : undefined
    }

    /**
     * 键控 toolview(preview_image):从 meta 读取 { src, mime, label } 渲染
     * 原生 <img>。
     */
    function PreviewToolView(props) {
      const meta = metaOf(props)
      const label = typeof meta === 'object' && meta !== null && typeof meta.label === 'string' ? meta.label : '预览'
      const src = typeof meta === 'object' && meta !== null && typeof meta.src === 'string' ? meta.src : null
      const isSvg = typeof meta === 'object' && meta !== null && meta.mime === 'image/svg+xml'
      if (src === null) {
        return React.createElement('div', { className: 'dip-root', 'data-dip-preview': true },
          React.createElement('span', { className: 'dip-missing' }, '图片预览缺少数据(meta 缺失)'))
      }
      return React.createElement('div', { className: 'dip-root', 'data-dip-preview': true },
        React.createElement('span', { className: 'dip-label' }, label),
        React.createElement('figure', { className: 'dip-figure' },
          React.createElement('img', {
            className: 'dip-img' + (isSvg ? ' svg' : ''),
            src: src,
            alt: label,
          })))
    }

    const NUMERIC_RE = /^-?\d+(\.\d+)?$/

    /** 截断/统计脚注:「显示前 50 / 1234 行 · 前 5 / 8 列 · 分隔符 ","」。 */
    function csvNote(meta) {
      const parts = []
      parts.push(meta.rowsShown < meta.totalRows
        ? `显示前 ${meta.rowsShown} / ${meta.totalRows} 行`
        : `共 ${meta.totalRows} 行`)
      if (meta.colsShown < meta.totalCols) parts.push(`前 ${meta.colsShown} / ${meta.totalCols} 列`)
      parts.push(`分隔符 "${meta.delimiter === '\t' ? 'Tab' : meta.delimiter}"`)
      return parts.join(' · ')
    }

    /**
     * 对数据行(不含表头)按列排序:整列(除空串)可解析为数字时按数值比较,
     * 否则按中文 locale 比较;空值恒沉底。dir=1 升序,-1 降序。
     */
    function sortBodyRows(meta, col, dir) {
      const body = meta.rows.slice(1)
      const numeric = body.every((r) => {
        const v = col < r.length ? r[col] : ''
        return v === '' || NUMERIC_RE.test(v)
      }) && body.some((r) => col < r.length && NUMERIC_RE.test(r[col]))
      const cmp = numeric
        ? (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)
        : (a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN')
      return body
        .map((_, i) => i)
        .sort((x, y) => {
          const a = x < body.length && col < body[x].length ? body[x][col] : ''
          const b = y < body.length && col < body[y].length ? body[y][col] : ''
          if ((a === '') !== (b === '')) return a === '' ? 1 : -1
          return cmp(a, b) * dir
        })
        .map((i) => body[i])
    }

    /**
     * 键控 toolview(preview_csv):从 meta 读取 { label, delimiter, rows,
     * totalRows, totalCols, rowsShown, colsShown },渲染原生 <table>。
     * rows[0] 为表头;数字单元格右对齐;表头点击循环排序(升→降→取消)。
     */
    function CsvToolView(props) {
      const meta = metaOf(props)
      const ok = meta !== null && typeof meta === 'object' && Array.isArray(meta.rows) && meta.rows.length > 0
      // hooks 必须无条件调用,放在提前 return 之前。
      const sortPair = React.useState(null) // null | { col, dir }
      const sort = sortPair[0]
      const setSort = sortPair[1]
      if (!ok) {
        return React.createElement('div', { className: 'dip-root', 'data-dip-preview': true },
          React.createElement('span', { className: 'dip-missing' }, 'CSV 预览缺少数据(meta 缺失)'))
      }
      const label = typeof meta.label === 'string' && meta.label !== '' ? meta.label : 'CSV 预览'

      const headerClick = (ci) => {
        setSort((prev) => (prev !== null && prev.col === ci ? (prev.dir === 1 ? { col: ci, dir: -1 } : null) : { col: ci, dir: 1 }))
      }

      const thead = React.createElement('thead', null,
        React.createElement('tr', null, meta.rows[0].map((c, i) => {
          const indicator = sort !== null && sort.col === i ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''
          return React.createElement('th', {
            key: i,
            onClick: () => headerClick(i),
            title: String(c),
          }, String(c) + indicator)
        })))
      const bodyRows = sort !== null ? sortBodyRows(meta, sort.col, sort.dir) : meta.rows.slice(1)
      const tbody = React.createElement('tbody', null, bodyRows.map((r, ri) =>
        React.createElement('tr', { key: ri }, r.map((c, ci) => {
          const s = String(c)
          return React.createElement('td', {
            key: ci,
            className: NUMERIC_RE.test(s) ? 'num' : undefined,
            title: s,
          }, s)
        }))))
      return React.createElement('div', { className: 'dip-root', 'data-dip-preview': true },
        React.createElement('span', { className: 'dip-label' }, label),
        React.createElement('div', { className: 'dip-table-wrap' },
          React.createElement('table', { className: 'dip-table' }, thead, tbody)),
        React.createElement('span', { className: 'dip-csv-note' }, csvNote(meta)))
    }

    // ── 服务接入 ─────────────────────────────────────────────────────────────
    const inject = []
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      const disposals = [
        slots.inject('tool.call.toolview', () => slots.register(
          { name: 'tool.call.toolview', key: 'preview_image' },
          PreviewToolView,
        )),
        slots.inject('tool.call.toolview', () => slots.register(
          { name: 'tool.call.toolview', key: 'preview_csv' },
          CsvToolView,
        )),
      ]
      return () => { for (const dispose of disposals) dispose() }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
