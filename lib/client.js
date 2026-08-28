/**
 * dsh-csv-and-image-preview 浏览器端 bundle(单文件,经 __ModuleLoader__ 加载)。
 *
 * 为 `preview_image` 工具注册键控 toolview(`tool.call.toolview`, key =
 * 'preview_image'):宿主把 data-URI 投递到结果节点的 meta,这里读取它并渲染
 * 成浏览器原生 <img>。这样图片不经过聊天渲染器的 markdown/genui 白名单,
 * 直接以真实 DOM 显示。
 *
 * 样式使用 --dsw-* 主题变量,跟随全局亮/暗主题。
 * @module dsh-csv-and-image-preview/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-csv-and-image-preview',
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

    /**
     * 键控 toolview:从结果节点 `block.meta` 读取宿主投递的 { src, mime, label }。
     * meta 仅在 settled 结果节点上存在;running 调用或回退时显示摘要行。
     */
    function PreviewToolView(props) {
      const block = props && props.block
      const meta = block !== null && typeof block === 'object' && 'meta' in block ? block.meta : undefined
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

    // ── 服务接入 ─────────────────────────────────────────────────────────────
    const inject = []
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      const dispose = slots.inject('tool.call.toolview', () => slots.register(
        { name: 'tool.call.toolview', key: 'preview_image' },
        PreviewToolView,
      ))
      return () => { dispose() }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
