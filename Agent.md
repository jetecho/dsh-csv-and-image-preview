# Agent.md — dsh-csv-and-image-preview 行为契约

这份文档定义当你(agent)使用 `dsh-csv-and-image-preview` 时应遵守的**预览式工作流**。它是给 agent 读的规则,搭配仓库里的独立 agent preset(`image-preview`)一起使用,把规则写进会话 persona。

## 核心原则:先预览,后落地

凡涉及**生成或修改图片 / SVG / CSV**,默认顺序必须是:

1. **先预览** —— 调用 `preview_image`(图片 / SVG)或 `preview_csv`(CSV / TSV 表格),把结果渲染到聊天里给用户看;
   - 读磁盘文件:`path=<绝对路径>`
   - 内联 SVG(未落盘):`content=<svg ...> mime=image/svg+xml`
   - 内联 CSV(未落盘):`content=<csv 文本>`;可用 `maxRows` 控制预览行数(默认 50,上限 500),`delimiter` 指定分隔符
   - 任意图片资源:直接传 `path`
2. **等确认** —— 预览后停止写入,等待用户明确同意;
3. **用户认可**(如 `确认` / `可以` / `就这样`)后,才真正写文件 / 执行改动;
4. **用户否决** 时,按反馈修改并**再次预览**,直到认可为止。

## 不要做的事

- 不要在没预览的情况下,直接覆盖或新增一个图片 / SVG / CSV 文件。
- 不要把图片字节或 CSV 全文/大段表格数据塞进回复文本或模型上下文 —— 那是 meta 的活,你只需拿到紧凑摘要。
- 不要用 markdown `![alt](data:...)` 或 ```` ```dsh-ui ```` 的 `image` 组件来"显示图片"—— 聊天渲染器会拦截,必须走 `preview_image`;同理 CSV 必须走 `preview_csv`,不要用整段代码块充当"预览"。

## 交互话术

- 预览后:**"这是预览,请确认后再写入。"** 或列出的差异点。
- 等待确认时,保持在工作流里,不要擅自落地。
- 确认后:**"已按预览图写入 `path`。"**

## 插件能力

| 能力 | 说明 |
|---|---|
| `preview_image` 工具 | 读取文件 / 内联 SVG → data-URI → 浏览器 `<img>` 渲染 |
| `preview_csv` 工具 | 读取 CSV/TSV / 内联文本 → 有界解析(默认前 50 行,上限 500,列/单元格截断)→ 浏览器 `<table>` 渲染,控件限高局部滚动,表头可点击排序 |
| 键控 toolview | `tool.call.toolview` key=`preview_image` / `preview_csv`,渲染原生 DOM |
| meta 通道 | 图片字节与表格数据只走 `presentationMeta` 进浏览器,不进模型上下文 |

## 为什么

聊天渲染器不渲染 markdown 或 genui 里的图片(白名单里也没有 `image` 组件)。`React.createElement('img')` 生成的是浏览器原生 `<img>`,不经过那套过滤,所以能真实显示;CSV 同理,原生 `<table>` 键控 toolview 直接渲染,模型只拿行列摘要。预览式工作流让用户**先看到结果再决策**,避免"生成即覆写"的返工。
