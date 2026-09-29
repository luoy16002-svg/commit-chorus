import { describe, expect, it } from 'vitest';
import { loadRepo, RepoError } from '../src/loader/github';
import { parseRepo } from '../src/loader/repo';

describe('parseRepo', () => {
  it.each([
    ['denoland/deno', 'denoland', 'deno'],
    ['https://github.com/denoland/deno', 'denoland', 'deno'],
    ['github.com/denoland/deno/', 'denoland', 'deno'],
    ['https://www.github.com/vitejs/vite.git', 'vitejs', 'vite'],
    ['https://github.com/oven-sh/bun/tree/main/src', 'oven-sh', 'bun'],
    ['git@github.com:sveltejs/svelte.git', 'sveltejs', 'svelte'],
    ['  facebook/react  ', 'facebook', 'react'],
  ])('reads %s', (input, owner, name) => {
    expect(parseRepo(input)).toEqual({ owner, name });
  });

  it.each(['', 'deno', 'https://gitlab.com/a/b', 'a/../b', 'bad name/x'])('rejects %s', (input) => {
    expect(parseRepo(input)).toBeNull();
  });
});

type Page = { sha: string; login: string | null; name: string; date: string; message: string }[];

/** A fake GitHub: `pages[0]` is page 1 (newest). Records every request path. */
function fakeGitHub(pages: Page[], opts: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const f = async (url: string | URL | Request) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push(path);
    if (opts.status) return new Response('{}', { status: opts.status, headers: opts.headers });
    if (!path.includes('/commits')) return new Response(JSON.stringify({ full_name: 'o/r' }), { status: 200 });
    const page = Number(new URL('https://x' + path).searchParams.get('page'));
    const body = pages[page - 1].map((c) => ({
      sha: c.sha.padEnd(40, '0'),
      author: c.login ? { login: c.login, avatar_url: `https://avatars.example/${c.login}?v=4`, type: c.login.endsWith('[bot]') ? 'Bot' : 'User' } : null,
      commit: { author: { name: c.name, date: c.date }, message: c.message },
    }));
    const headers: Record<string, string> = {};
    if (pages.length > 1) headers.link = `<https://api.github.com/repos/o/r/commits?per_page=100&page=${pages.length}>; rel="last"`;
    return new Response(JSON.stringify(body), { status: 200, headers });
  };
  return { f: f as typeof fetch, calls };
}

const day = (n: number) => new Date(Date.UTC(2020, 0, 1) + n * 86_400_000).toISOString();

describe('loadRepo', () => {
  it('reads the oldest page first and returns commits oldest first', async () => {
    const pages: Page[] = [
      [{ sha: 'ccc', login: 'b', name: 'Bee', date: day(20), message: 'third\n\nbody' }],
      [
        { sha: 'bbb', login: null, name: 'Anon', date: day(10), message: 'second' },
        { sha: 'aaa', login: 'a', name: 'Ay', date: day(0), message: 'first' },
      ],
    ];
    const { f, calls } = fakeGitHub(pages);
    const song = await loadRepo({ owner: 'o', name: 'r' }, { fetch: f });
    expect(song.commits.map((c) => c.msg)).toEqual(['first', 'second', 'third']);
    expect(song.authors.map((a) => [a.key, a.name])).toEqual([['a', 'Ay'], ['name:Anon', 'Anon'], ['b', 'Bee']]);
    expect(calls).toEqual(['/repos/o/r', '/repos/o/r/commits?per_page=100&page=1', '/repos/o/r/commits?per_page=100&page=2']);
    expect(song.window.capped).toBe(false);
  });

  it('stops after a year', async () => {
    const pages: Page[] = [[
      { sha: 'ccc', login: 'a', name: 'A', date: day(400), message: 'late' },
      { sha: 'bbb', login: 'a', name: 'A', date: day(300), message: 'in' },
      { sha: 'aaa', login: 'a', name: 'A', date: day(0), message: 'start' },
    ]];
    const song = await loadRepo({ owner: 'o', name: 'r' }, { fetch: fakeGitHub(pages).f });
    expect(song.commits.map((c) => c.msg)).toEqual(['start', 'in']);
  });

  it('caps at maxCommits and marks the window as capped', async () => {
    const page: Page = Array.from({ length: 5 }, (_, i) => ({ sha: `s${i}`, login: 'a', name: 'A', date: day(4 - i), message: `m${4 - i}` }));
    const song = await loadRepo({ owner: 'o', name: 'r' }, { fetch: fakeGitHub([page]).f, maxCommits: 3 });
    expect(song.commits.map((c) => c.msg)).toEqual(['m0', 'm1', 'm2']);
    expect(song.window.capped).toBe(true);
  });

  it('stops at the request budget and plays what it has', async () => {
    const pages: Page[] = [0, 1, 2, 3].map((p) => [{ sha: `s${p}`, login: 'a', name: 'A', date: day(3 - p), message: `m${3 - p}` }]);
    const { f, calls } = fakeGitHub(pages);
    const song = await loadRepo({ owner: 'o', name: 'r' }, { fetch: f, maxRequests: 4 });
    expect(calls).toHaveLength(4); // repo, page 1, pages 4 and 3
    expect(song.commits.map((c) => c.msg)).toEqual(['m0', 'm1']);
    expect(song.window.capped).toBe(true);
  });

  it('marks bots', async () => {
    const song = await loadRepo({ owner: 'o', name: 'r' }, {
      fetch: fakeGitHub([[{ sha: 'aaa', login: 'dependabot[bot]', name: 'dependabot[bot]', date: day(0), message: 'bump' }]]).f,
    });
    expect(song.authors[0].bot).toBe(true);
  });

  it('explains a missing repository, the rate limit and an empty repository', async () => {
    await expect(loadRepo({ owner: 'o', name: 'r' }, { fetch: fakeGitHub([], { status: 404 }).f })).rejects.toMatchObject({ kind: 'not-found' });
    const limited = fakeGitHub([], { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } });
    const err = (await loadRepo({ owner: 'o', name: 'r' }, { fetch: limited.f }).catch((e) => e)) as RepoError;
    expect(err.kind).toBe('rate-limited');
    expect(err.resetAt?.getTime()).toBe(1700000000 * 1000);
    await expect(loadRepo({ owner: 'o', name: 'r' }, { fetch: fakeGitHub([[]]).f })).rejects.toMatchObject({ kind: 'empty' });
  });
});
