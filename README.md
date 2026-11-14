# 作品集 · ShiningRay

把 GitHub 上的全部公开项目变成一个可浏览的个人展示页。

- **一个 HTML 文件**：`dist/index.html` ≈ 72 KB 的自包含单文件——无框架、无构建运行时、无外链字体/CDN，断网也能打开。
- **中英双语**：右上角切换，自动记住选择；`?lang=en` 可直达。
- **像素 + 二次元**：硬阴影方块、像素星标与荧光边框、手绘像素小猫、竖排假名、闪烁星点——但正文仍然是一屏能读的排版。
- **数据来自 GitHub**：GraphQL 拉仓库，没写描述的仓库用 README 首段兜底。
- **有点人味**：首屏之后有一栏「在玩」，三款游戏的像素徽标是手写 `<rect>` 画的，不是图标库。
- **承认消失**：精选之后有一栏「曾经」，放的是已经下线的产品；卡面是像素浏览器窗口 + `已下线` 标签，点开直达 Wayback 快照——不靠自述，靠可验证的物证。
- **不是仓库列表**：有精选位、有按主题切的 7 个系列、有搜索/筛选/排序。
- **两个入口**：一个网页（GitHub Pages），一份 Profile README（中英各一）。

```
77 个原创仓库 · 7 个主题系列 · 12 种语言 · 双语 · 76 KB
```

## 快速开始

```bash
cd showcase

node scripts/fetch-repos.mjs    # GitHub → data/repos.json
node scripts/build.mjs          # → dist/index.html（本地双击就能看）
node scripts/build-readme.mjs   # → dist/README.profile.md + .en.md
```

或一次跑完：`npm run all`。

抓数据需要凭据，二选一：

```bash
gh auth login          # 有 gh CLI 就直接复用它的 token
export GITHUB_TOKEN=…  # 或显式给一个（CI 里用 secrets.GITHUB_TOKEN）
```

零依赖，不需要 `npm install`。Node ≥ 18。

### 给「曾经」栏挂截图

把图片放进 `showcase/assets/legacy/`，然后在 `showcase.config.json` 里给对应条目加 `shot`：

```json
{ "id": "qiushibaike", "shot": "assets/legacy/qiushibaike.png" }
```

构建时会 **base64 内联**成 data URI，所以仍然是单文件、不依赖外部链接，也不会因为图片删除而变空。规则：支持 png / jpg / webp / gif / svg，单张 **≤ 400 KB**（超出会跳过并提示），卡片按 16:10 裁切、最高 260px，并强制 `image-rendering: pixelated`——老截图放大后纹理更接近像素风。没有 `shot` 时只显示浏览器窗口，不会留下空框。

## 自定义

所有内容向的改动都在 `showcase.config.json`，改了重跑 `build` 即可。

| 字段 | 作用 |
| --- | --- |
| `site.brand` / `brandEn` | 品牌名。中文界面大字是中文，英文界面大字换成 `brandEn`（脚本自动对调） |
| `site.title` / `titleEn` | 两个语言各自的 `<title>` / OG 标题 |
| `site.description` / `descriptionEn` | 两个语言各自的 SEO 描述 |
| `site.bubble` / `bubbleEn` | 头像旁气泡里的问候语 |
| `site.tagline` / `taglineEn` | 气泡下的第二行 |
| `site.links` | 首屏社交链接（GitHub / X / 博客…），`kind: "github"` 会接管导航按钮 |
| `siteUrl` | 部署后的地址，写进 `canonical`、Profile README |
| `games` | 「在玩」区：`id`、`name`/`nameEn`、`tag`/`tagEn`、`color`。`id` 同时决定用哪个像素徽标，见下表 |
| `legacy` | 「曾经」区（已下线产品）：`domain`、`name`/`nameEn`、`blurb`/`blurbEn`、`role`/`roleEn`、`years`、`color`；`years` 留空则不显示。链接自动指向 `web.archive.org/web/*/{domain}`。可选 `shot`：本地图片路径（见下） |
| `i18n.zh` / `i18n.en` | **界面文案**：按钮、表头、排序项、空状态…每个键两边各写一份 |
| `featured` | 精选仓库名，按顺序排 |
| `collections` | 主题系列：`name`/`nameEn`、`blurb`/`blurbEn`、`repos[]` |
| `overrides` | 单仓库覆盖：`description`/`descriptionEn`、`language`、`color` |
| `hide` | 不想展示的仓库名 |
| `showArchived` | 是否展示已归档仓库 |

版式、配色、动效在 `src/template.html`（原生 CSS + 一段无依赖 JS）。

## 双语是怎么工作的

1. 语言判定顺序：URL 的 `?lang=` → `localStorage['showcase:lang']` → 浏览器语言（`zh*` 走中文，其余走英文）→ `i18n` 的第一项。
2. 界面文案全部来自 `i18n.{zh,en}`，通过 `data-t="键名"` 打点，切语言时整块重画（chips、列表、统计都会跟着换）。
3. **仓库描述不翻译**：一句 description 是 GitHub 上的原文，中文仓库显中文、英文仓库显英文。想人工覆盖就写 `overrides.<repo>.description` / `descriptionEn`。
4. 语言按钮的选择会写进 `localStorage`，下次打开还是上次的语言；对外分享英文版用 `https://…/?lang=en`。

加第三种语言：在 `showcase.config.json` 的 `i18n` 里加一个 `ja` 键（键名照抄 `zh` 那套），`collections` 里补 `nameJa`/`blurbJa`，模板右上角加一个 `<button data-lang="ja">` 即可——其余不用动。

## 像素 / 二次元风格在哪调

整套风格只靠 CSS 变量和几个像素件，没有图片资源：

| 想改什么 | 改哪里 |
| --- | --- |
| 主色（粉/青/紫/黄/绿） | `:root` 里的 `--pink / --cyan / --violet / --yellow / --lime` |
| 亮色模式 | 紧跟的 `@media (prefers-color-scheme:light)` 同名变量 |
| 硬阴影的厚度 | `--px`、以及 `.card` / `.status` / `.btn` 的 `box-shadow: Npx Npx 0 var(--shadow)` |
| 像素星标 / 小猫 / 空状态幽灵 | 页面里的内联 `<svg shape-rendering="crispEdges">`，改 `rect` 就行 |
| 「在玩」的三个游戏徽标 | `src/template.html` 的 `GLYPH` 对象（`genshin` / `starrail` / `zzz`），各自是一串 16×16 的 `<rect>`；新增游戏就在 `games` 里加一项并补一个 `GLYPH` 键 |
| 竖排假名水印 | `.kana`（宽度 < 1180px 自动隐藏） |
| 闪烁星点 | `.spark` 与 `@keyframes twinkle`（`steps(2,end)` 才有像素感） |
| 网格底纹 | `body::after` 的 `background-size: 24px 24px` |

真想要正文字体也变像素：把一个 woff2 base64 进 `<style>`，或在 `:root --sans` 里换成系统里的像素字体名。默认没有这么做——像素字体读长段落太累。

无障碍：正文对比度全部 ≥ 4.5（暗色 7.2–10.9，亮色 5.5–9.1）；`prefers-reduced-motion` 会关掉所有动画；chips 用 `aria-pressed`，语言按钮用 `aria-pressed`。

## 部署到 GitHub Pages

1. 新建一个公开仓库（名字随意，比如 `showcase`），把 `showcase/` 目录推上去。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 推送即触发 `.github/workflows/deploy.yml`：抓数据 → 构建 → 发布。之后**每天 05:00 自动重跑**（新项目、新 star 会自己出现），也可以在 Actions 页手动 `Run workflow`。
4. 站点地址形如 `https://<user>.github.io/showcase/`，把它填回 `showcase.config.json` 的 `siteUrl` 再推一次。

> 本页资源全部内联或相对路径，放在子路径下不需要额外配置 `base`。

## 再进一步：Profile README

`build-readme.mjs` 产出两份：`dist/README.profile.md`（中文）、`dist/README.profile.en.md`（English），各自顶部有一行互相跳转。

1. 新建**与用户名同名**的仓库 `ShiningRay/ShiningRay`（勾选 "Add a README file"）。
2. 把其中一份的内容贴成它的 `README.md`（另一份可以另存为 `README.en.md`）。
3. 提交后，你的 GitHub 主页顶部就是这个展示柜。

两个入口各管一段：**陌生人在 GitHub 上看到的是一页 README**，想细看再点进网页；**网页负责"好看"和"可检索"**。

## 目录

```
showcase/
├─ showcase.config.json      # 内容 + 双语文案 + 精选/系列
├─ src/template.html         # 页面模板（占位符 + 内联 CSS/JS）
├─ scripts/
│  ├─ fetch-repos.mjs        # GitHub GraphQL → data/repos.json
│  ├─ build.mjs              # 配置 + 数据 → dist/index.html
│  └─ build-readme.mjs       # → dist/README.profile{,en}.md
├─ data/repos.json           # 抓取快照（已提交，便于 diff）
├─ dist/
│  ├─ index.html             # 产物：单文件站点
│  ├─ README.profile.md      # 中文版 Profile README
│  └─ README.profile.en.md   # 英文版
└─ .github/workflows/deploy.yml
```

## 关于数据

只展示**公开**仓库（`fetch-repos.mjs` 拿到结果后过滤掉 `isPrivate`）。`data/repos.json` 里只有仓库元信息、star 数、语言与 README 首段摘要，没有任何凭据。
