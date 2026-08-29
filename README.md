# dsh-csv-and-image-preview

[English](README.en.md) | 中文

在 DeepSeek Harness (dsh) 聊天里**真正把图片 / SVG / CSV 显示出来**的插件。图片与 SVG 以浏览器原生 `<img>` 渲染，CSV/TSV 表格以原生 `<table>` 渲染（粘性表头、控件限高局部滚动），均绕过聊天渲染器对 markdown / genui 的过滤；同时内置**预览式工作流**：生成或修改图片、SVG 或 CSV 时，先把结果渲染给你看，等你确认后再落地真正的改动。

## 安装

标准 Profile Bundle 安装（推荐）：

```sh
dsh plugin --profile web add @jetecho/dsh-csv-and-image-preview
```

或从本地目录安装开发版：

```sh
dsh plugin --profile web add ../dsh-csv-and-image-preview
```

安装后需重启 `dsh web` 让新 bundle 进入运行时。更早版本兼容做法是手动把包复制进 profile 的 `node_modules` 并在 `cordis.patch.yml` 插入 `- insert: [...]`，仅作旧版本兜底。

## 它做什么

1. **真渲染图片**。宿主注册 `preview_image` 工具：读取文件路径（或内联 SVG），推断 MIME、base64 编码成 data-URI，通过工具结果的 `presentationMeta` 投递；浏览器端键控 toolview（`tool.call.toolview` key=`preview_image`）读取 meta 并渲染原生 `<img>`。图片字节只走 meta 进浏览器，**不进入模型上下文**。
2. **预览式工作流**。调用 `preview_image` 后，脚本拿到的是紧凑摘要（SVG/位图、尺寸、字节数），真正的画面直接显示在聊天里；脚本会「等待用户确认」，等你点头后才写入文件/执行改动。
3. **预览任意资源**。给一个本地路径即可预览对应图片文件；也能传入内联 SVG 文本直接渲染，无需落盘。
4. **CSV/TSV 表格预览**。宿主注册 `preview_csv` 工具：读取 CSV/TSV 文件（或内联文本），自动嗅探分隔符（`,` `;` Tab `|`，可用 `delimiter` 指定），有界解析后把表格投递到 meta；浏览器端键控 toolview（key=`preview_csv`）渲染原生 `<table>`。表格控件**限高 320px 局部滚动**，默认只投递前 50 行（`maxRows` 可调，上限 500），超宽列数与超长单元格也会截断——模型只拿到行列摘要，表格数据不进模型上下文。表头**点击排序**（数值/中文拼音自适应，空值沉底，升→降→取消循环），单元格超长自动省略号、悬停看全文。

## 用法示例

```markdown
<!-- 预览磁盘上的 logo -->
我先给你看预览。
[调用 preview_image path=E:\DSHConfig\logo-a.svg label=ALPHA]
```

```markdown
<!-- 预览内联 SVG（未落盘） -->
[调用 preview_image content=<svg ...> mime=image/svg+xml label=草图]
```

```markdown
<!-- 预览 CSV 文件（截断到前 100 行） -->
[调用 preview_csv path=E:\DSHConfig\data.csv label=销售数据 maxRows=100]
```

脚本会读到类似 `已渲染预览「ALPHA」:SVG 矢量图(1.3 KB)。` 的返回，图片则显示在工具卡片里；CSV 则是 `已渲染 CSV 预览「销售数据」:CSV 表格 1234 行 × 5 列,分隔符 ",";显示前 100 行。`，表格显示在工具卡片里。

## 约定：预览优先

本插件把「先预览、后落地」作为默认约定：

- 生成 / 修改图片、SVG 或 CSV 时，**先** `preview_image` / `preview_csv` 渲染，不做真实写入；
- 用户确认（`确认` / `可以` / `就这样`）后，才真正写文件 / 执行改动；
- 用户否决时，按反馈重做并再次预览；
- 需要预览任意资源时，直接传 `path`。

要强制遵守这一约定，可以配合附带的 agent preset（见 `Agent.md`），它会把这套规则写进会话 persona。

## 组成部分

```
lib/index.js   宿主：注册 preview_image / preview_csv 工具，读取文件并投递 data-URI / 表格 meta
lib/client.js  浏览器 bundle：注册键控 toolview，渲染原生 <img> / <table>
cordis.patch.yml  profile 插入行
```

## 开发

```sh
pnpm install
pnpm build       # no-op：lib/ 为成品，无需转译
pnpm prepack     # 校验打包内容含 lib/
```

## License

MIT © [jetecho](./LICENSE)，详见 [LICENSE](./LICENSE)。
