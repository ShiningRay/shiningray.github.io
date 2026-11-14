#!/usr/bin/env node
/**
 * 生成 GitHub Profile README（中英各一份）。
 *
 * 用法：node scripts/build-readme.mjs
 * 产物：dist/README.profile.md（中文）、dist/README.profile.en.md（English）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(resolve(ROOT, p), 'utf8'));

const COPY = {
  zh: {
    file: 'README.profile.md',
    featured: '精选',
    series: '主题系列',
    all: (n) => `全部 ${n} 个原创仓库`,
    project: '项目',
    language: '语言',
    desc: '说明',
    other: 'English version → [README.profile.en.md](README.profile.en.md)',
    site: '作品集',
    gen: (d, u) => `<sub>由 GitHub API 自动生成 · ${d}${u ? ` · ${u}` : ''}</sub>`,
    stats: (r, s, l) => `\`${r} 个原创仓库\` · \`${s} stars\` · \`${l} 种语言\``,
    playing: '在玩',
  },
  en: {
    file: 'README.profile.en.md',
    featured: 'Featured',
    series: 'Series',
    all: (n) => `All ${n} original repositories`,
    project: 'Project',
    language: 'Language',
    desc: 'What it is',
    other: '中文版本 → [README.profile.md](README.profile.md)',
    site: 'Showcase',
    gen: (d, u) => `<sub>Auto-generated from the GitHub API · ${d}${u ? ` · ${u}` : ''}</sub>`,
    stats: (r, s, l) => `\`${r} original repos\` · \`${s} stars\` · \`${l} languages\``,
    playing: 'Now playing',
  },
};

async function main() {
  const config = await readJson('showcase.config.json');
  const raw = await readJson('data/repos.json');
  const site = config.site;
  const originals = raw.repos.filter((r) => !r.isFork && !(config.hide || []).includes(r.name));
  const repo = (n) => originals.find((r) => r.name === n);

  const descOf = (r, en) => {
    const o = config.overrides?.[r.name] || {};
    if (en) return (o.descriptionEn || r.description || r.readme || '').trim();
    return (o.description || r.description || r.readme || '').trim();
  };
  const langOf = (r) => config.overrides?.[r.name]?.language || r.language || '—';

  const featured = (config.featured || []).map(repo).filter(Boolean);
  const stars = originals.reduce((s, r) => s + (r.stars || 0), 0);
  const langs = new Set(originals.map((r) => langOf(r)).filter((l) => l && l !== '—'));
  const siteUrl = (config.siteUrl || '').replace(/\/?$/, '/');
  const last = new Date(raw.generatedAt);
  const day = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;

  const clip = (t, n = 68) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

  const build = (lang) => {
    const c = COPY[lang];
    const en = lang === 'en';
    const L = [];
    L.push(`### ${site.brand} · ${site.brandEn}`, '');
    const lede = (config.i18n?.[en ? 'en' : 'zh'] || {}).lede || site.lede || '';
    L.push(`**${lede}**`, '');
    L.push(
      [
        ...(site.links || []).map((l) => `[${l.label}](${l.href})`),
        siteUrl ? `[${c.site}](${siteUrl}${en ? '?lang=en' : ''})` : '',
        c.other,
      ]
        .filter(Boolean)
        .join(' · '),
    );
    L.push('');
    L.push(c.stats(originals.length, stars, langs.size), '');
    const games = config.games || [];
    if (games.length) {
      L.push(`**${c.playing}** · ${games.map((g) => (en ? g.nameEn || g.name : g.name)).join(' / ')}`, '');
    }
    L.push(`## ${c.featured}`, '');
    L.push(`| ${c.project} | ${c.language} | ${c.desc} |`);
    L.push('| :--- | :--- | :--- |');
    for (const r of featured) {
      L.push(`| **[${r.name}](${r.url})** | ${langOf(r)} | ${clip(descOf(r, en)) || '—'} |`);
    }
    L.push('');
    L.push(`## ${c.series}`, '');
    for (const col of config.collections || []) {
      const items = col.repos.map(repo).filter(Boolean);
      if (!items.length) continue;
      L.push(`**${en ? col.nameEn || col.name : col.name}** — ${en ? col.blurbEn || col.blurb : col.blurb}`, '');
      L.push(items.map((r) => `[${r.name}](${r.url})`).join(' · '), '');
    }
    L.push('<details>', `<summary>${c.all(originals.length)}</summary>`, '');
    for (const r of [...originals].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const d = descOf(r, en);
      L.push(`- [${r.name}](${r.url})${d ? ` — ${d}` : ''}`);
    }
    L.push('', '</details>', '');
    L.push(c.gen(day, siteUrl));
    return L.join('\n') + '\n';
  };

  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  for (const lang of Object.keys(COPY)) {
    const out = resolve(ROOT, 'dist', COPY[lang].file);
    await writeFile(out, build(lang), 'utf8');
    console.log(`✓ ${out}`);
  }
  console.log(`  ${originals.length} 个原创仓库 · ${featured.length} 个精选`);
}

main().catch((e) => {
  console.error('✗ 失败：', e.message);
  process.exit(1);
});
