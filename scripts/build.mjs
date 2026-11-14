#!/usr/bin/env node
/**
 * 把 data/repos.json + showcase.config.json 渲染成单文件静态页 dist/index.html。
 *
 * 用法：node scripts/build.mjs
 * 产物不依赖任何外部资源（除头像图片），可以直接双击打开，也可以丢到 GitHub Pages。
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = async (p) => JSON.parse(await readFile(resolve(ROOT, p), 'utf8'));

/** 把过暗的语言色提到暗色背景能看清的亮度，同时保留色相。 */
function readable(hex, fallback = '#8b95ff') {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return fallback;
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.22) return '#' + n.toString(16).padStart(6, '0');

  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  const nl = 0.62;
  const ns = Math.max(s, 0.55);
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns;
  const p = 2 * nl - q;
  const to = (t) => Math.round(hue2rgb(p, q, t) * 255).toString(16).padStart(2, '0');
  return `#${to(h + 1 / 3)}${to(h)}${to(h - 1 / 3)}`;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

/** 把本地图片内联成 data URI，保持单文件交付；超过 400 KB 就跳过并告警。 */
function inlineImage(rel) {
  if (!rel) return '';
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) {
    console.log(`  ! 找不到图片: ${rel}`);
    return '';
  }
  const buf = readFileSync(abs);
  if (buf.length > 400 * 1024) {
    console.log(`  ! 图片过大，已跳过: ${rel} (${(buf.length / 1024).toFixed(1)} KB > 400 KB)`);
    return '';
  }
  const mime = MIME[extname(abs).toLowerCase()];
  if (!mime) {
    console.log(`  ! 不支持的图片格式: ${rel}`);
    return '';
  }
  console.log(`  ✓ 内联图片 ${rel} (${(buf.length / 1024).toFixed(1)} KB)`);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const byDate = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

async function main() {
  const config = await readJson('showcase.config.json');
  const raw = await readJson('data/repos.json');
  const site = config.site;

  // ---- 仓库 ----
  const hidden = new Set(config.hide || []);
  const showArchived = config.showArchived !== false;
  const byName = new Map(raw.repos.map((r) => [r.name, r]));

  const repos = raw.repos
    .filter((r) => !r.isFork && !hidden.has(r.name) && (showArchived || !r.isArchived))
    .map((r) => {
      const o = config.overrides?.[r.name] ?? {};
      const description = (o.description || r.description || r.readme || '').trim();
      const descriptionEn = (o.descriptionEn || r.description || r.readme || '').trim();
      return {
        name: r.name,
        description,
        descriptionEn,
        url: r.url,
        homepage: o.homepage ?? r.homepage ?? '',
        language: o.language ?? r.language ?? null,
        color: readable(o.color ?? r.color),
        stars: r.stars ?? 0,
        forks: r.forks ?? 0,
        topics: (r.topics || []).slice(0, 4),
        archived: !!r.isArchived,
        pushedAt: r.pushedAt,
        createdAt: r.createdAt,
        collections: [],
        featured: 0,
      };
    });

  // 防线：数据只剩零星几个仓库时直接失败，不要把半个空站发上线
  if (repos.length < 20) {
    throw new Error(
      `只有 ${repos.length} 个项目，data/repos.json 可能被写坏了。先跑 node scripts/fetch-repos.mjs 重新抓取。`,
    );
  }

  const repoMap = new Map(repos.map((r) => [r.name, r]));

  // ---- 精选 ----
  const featured = (config.featured || []).filter((name) => {
    if (repoMap.has(name)) return true;
    console.warn(`! featured 里的 "${name}" 不存在，已跳过`);
    return false;
  });
  featured.forEach((name, i) => (repoMap.get(name).featured = i + 1));

  // ---- 主题系列 ----
  const collections = (config.collections || []).map((c) => {
    const names = c.repos.filter((name) => {
      if (repoMap.has(name)) return true;
      console.warn(`! 系列 "${c.name}" 里的 "${name}" 不存在，已跳过`);
      return false;
    });
    for (const name of names) repoMap.get(name).collections.push(c.id);
    return {
      id: c.id,
      name: c.name,
      nameEn: c.nameEn || c.name,
      blurb: c.blurb || '',
      blurbEn: c.blurbEn || c.blurb || '',
      count: names.length,
    };
  });

  // ---- 语言统计 ----
  const langCount = new Map();
  for (const r of repos) {
    if (!r.language) continue;
    const cur = langCount.get(r.language) || { name: r.language, count: 0, color: r.color };
    cur.count += 1;
    langCount.set(r.language, cur);
  }
  const languages = [...langCount.values()].sort((a, b) => b.count - a.count);

  // ---- 统计数字 ----
  const stars = repos.reduce((s, r) => s + r.stars, 0);
  const lastUpdate = repos.map((r) => r.pushedAt).sort(byDate)[0] || raw.generatedAt;
  const stats = {
    repos: repos.length,
    stars,
    languages: languages.length,
    lastUpdate,
  };

  const firstYear = repos.map((r) => r.createdAt).filter(Boolean).sort()[0];

  const owner = {
    ...raw.owner,
    bio: raw.owner.bio || '',
  };

  const DATA = {
    lang: config.lang || 'zh',
    i18n: config.i18n || { zh: {} },
    generatedAt: raw.generatedAt,
    site,
    owner,
    stats,
    languages,
    collections,
    games: config.games || [],
    stack: site.stack || null,
    legacy: (config.legacy || []).map((x) => ({ ...x, shot: inlineImage(x.shot) })),
    featured,
    repos,
    forksSkipped: raw.repos.filter((r) => r.isFork).length,
    firstYear: firstYear ? Number(String(firstYear).slice(0, 4)) : null,
  };

  // ---- 渲染 ----
  const template = await readFile(resolve(ROOT, 'src/template.html'), 'utf8');
  const json = JSON.stringify(DATA).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  const tags = {
    __TITLE__: site.title,
    __DESCRIPTION__: site.description,
    __BRAND__: site.brand,
    __BRAND_EN__: site.brandEn,
    __EYEBROW__: site.eyebrow,
    __LEDE__: site.lede,
  };
  let html = Object.entries(tags)
    .reduce((acc, [k, v]) => acc.split(k).join(v), template)
    .replace('/*__DATA__*/ null', json);

  if (config.siteUrl) {
    const url = config.siteUrl.replace(/\/?$/, '/');
    const meta = `  <link rel="canonical" href="${url}">\n  <meta property="og:url" content="${url}">`;
    html = html.replace('</head>', `${meta}\n</head>`);
  }

  if (html === template) throw new Error('模板里没有找到 /*__DATA__*/ null 占位符');

  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  await writeFile(resolve(ROOT, 'dist/index.html'), html, 'utf8');

  // Pages 用：关掉 Jekyll 预处理；配了自有域名时额外写 CNAME
  await writeFile(resolve(ROOT, 'dist/.nojekyll'), '', 'utf8');
  if (config.domain) {
    const host = String(config.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    await writeFile(resolve(ROOT, 'dist/CNAME'), `${host}\n`, 'utf8');
    console.log(`✓ dist/CNAME  ${host}`);
  }

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`✓ dist/index.html  ${kb} KB`);
  console.log(
    `  ${repos.length} 个项目 · ${collections.length} 个系列 · ${languages.length} 种语言 · ` +
      `${stars} stars · 精选 ${featured.length}`,
  );
}

main().catch((err) => {
  console.error('\n✗ 构建失败：', err.message);
  process.exit(1);
});
