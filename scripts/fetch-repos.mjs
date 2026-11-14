#!/usr/bin/env node
/**
 * 拉取 GitHub 账号下所有仓库的元数据，写入 data/repos.json。
 *
 * 用法：
 *   node scripts/fetch-repos.mjs            # 用 gh CLI 的登录态
 *   GITHUB_TOKEN=xxx node scripts/fetch-repos.mjs
 *
 * 只读操作，不会改动任何仓库。
 */
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/repos.json');

const QUERY = `
query($after: String) {
  viewer {
    login
    name
    bio
    location
    websiteUrl
    avatarUrl
    followers { totalCount }
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        description
        homepageUrl
        url
        isArchived
        isFork
        isPrivate
        stargazerCount
        forkCount
        pushedAt
        createdAt
        primaryLanguage { name color }
        repositoryTopics(first: 12) { nodes { topic { name } } }
        licenseInfo { spdxId }
      }
    }
  }
}
`;

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    console.error('找不到 GitHub token：请先 `gh auth login`，或设置 GITHUB_TOKEN 环境变量。');
    process.exit(1);
  }
}

async function gql(tok, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tok}`,
      'content-type': 'application/json',
      'user-agent': 'shiningray-showcase',
    },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL 失败 HTTP ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data;
}

/** 常见的脚手架废话，直接判为无摘要。 */
const BOILERPLATE = [
  /^this readme would normally document/i,
  /^todo[:：]/i,
  /^short description and motivation/i,
  /^welcome to your new gem/i,
  /^add a description of your project here/i,
  /^installation\b/i,
  /^things you may want to cover/i,
  /^add this line to your application/i,
  /^先安装/,
  /^getting started\b/i,
  /^prerequisites\b/i,
];

/** 从 README 里抽一段可读摘要，给没有 description 的仓库兜底。 */
function excerptFromReadme(md) {
  if (!md) return '';
  let text = md
    .replace(/^---[\s\S]*?\n---\s*/, '') // front matter
    .replace(/```[\s\S]*?```/g, ' ') // 代码块
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ') // HTML
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ') // badge
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ') // 链接定义
    .replace(/\r/g, '');

  const blocks = text.split(/\n{2,}/);
  for (const raw of blocks) {
    const block = raw
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (!t) return false;
        if (/^#{1,6}\s/.test(t)) return false; // 标题
        if (/^[-*+]\s|^\d+\.\s/.test(t)) return false; // 列表
        if (/^\|/.test(t)) return false; // 表格
        if (/^\[!\[/.test(t)) return false; // badge
        if (/^(>|={3,}|-{3,})/.test(t)) return false;
        return true;
      })
      .join(' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (block.length < 24) continue;
    if (BOILERPLATE.some((re) => re.test(block))) continue;
    const cut = block.length > 170 ? block.slice(0, 170).replace(/[，,、\s]\S*$/, '') + '…' : block;
    return cut;
  }
  return '';
}

async function readmeExcerpt(tok, fullName) {
  const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
    headers: { authorization: `Bearer ${tok}`, accept: 'application/vnd.github.raw', 'user-agent': 'shiningray-showcase' },
  });
  if (res.status === 404) return '';
  if (!res.ok) return '';
  return excerptFromReadme(await res.text());
}

async function main() {
  const tok = token();
  let after = null;
  let viewer = null;
  const nodes = [];

  do {
    let data;
    for (let attempt = 1; ; attempt++) {
      try {
        data = await gql(tok, { after });
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        console.warn(`第 ${attempt} 次请求失败，1.5s 后重试：${err.message}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    const repos = data.viewer.repositories;
    viewer = data.viewer;
    nodes.push(...repos.nodes);
    after = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
    process.stdout.write(`\r已获取 ${nodes.length}/${repos.totalCount} 个仓库…`);
  } while (after);

  const repos = nodes
    .filter((n) => !n.isPrivate)
    .map((n) => ({
      name: n.name,
      description: (n.description ?? '').trim(),
      readme: '',
      url: n.url,
      homepage: (n.homepageUrl ?? '').trim(),
      language: n.primaryLanguage?.name ?? null,
      color: n.primaryLanguage?.color ?? null,
      stars: n.stargazerCount,
      forks: n.forkCount,
      topics: (n.repositoryTopics?.nodes ?? []).map((t) => t.topic.name),
      license: n.licenseInfo?.spdxId ?? null,
      isFork: n.isFork,
      isArchived: n.isArchived,
      pushedAt: n.pushedAt,
      createdAt: n.createdAt,
    }))
    .sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : -1));

  // 没有 description 的原创仓库：用 README 首段兜底，并发 6 个。
  const need = repos.filter((r) => !r.description && !r.isFork);
  let done = 0;
  const queue = [...need];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          r.readme = await readmeExcerpt(tok, `${viewer.login}/${r.name}`);
        } catch {
          r.readme = '';
        }
        done++;
        process.stdout.write(`\r补 README 摘要 ${done}/${need.length}…`);
      }
    }),
  );
  if (need.length) process.stdout.write('\n');

  const payload = {
    generatedAt: new Date().toISOString(),
    owner: {
      login: viewer.login,
      name: viewer.name || viewer.login,
      bio: viewer.bio || '',
      location: viewer.location || '',
      website: viewer.websiteUrl || '',
      avatar: viewer.avatarUrl,
      followers: viewer.followers.totalCount,
      publicRepos: nodes.filter((n) => !n.isPrivate && !n.isFork).length,
    },
    repos,
  };

  // 防线：Actions 里的 GITHUB_TOKEN 查 viewer 得到的是 github-actions[bot]，
  // 只能看见本仓库一个——这种情况必须失败退出，绝不能把「1 个仓库的展示页」发上线。
  const origin = viewer?.login ?? '';
  if (/\[bot\]$/.test(origin) || repos.length < 20) {
    throw new Error(
      `抓取结果不可信（viewer=${origin || '未知'}，公开仓库 ${repos.length} 个）。\n` +
        '  本地：确认 gh auth status 登录的是本人账号。\n' +
        '  CI：配置一个带 public read 权限的 SHOWCASE_TOKEN 再跑抓取，或跳过抓取步骤直接用仓库里已有的 data/repos.json。',
    );
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 写入 ${OUT}`);
  console.log(
    `  共 ${repos.length} 个公开仓库，其中原创 ${repos.filter((r) => !r.isFork).length} 个、` +
      `归档 ${repos.filter((r) => r.isArchived).length} 个、无描述 ${repos.filter((r) => !r.description).length} 个`,
  );
}

main().catch((err) => {
  console.error('\n✗ 失败：', err.message);
  process.exit(1);
});
