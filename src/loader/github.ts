import type { Author, Commit, Song } from '../types';
import type { RepoRef } from './repo';

const API = 'https://api.github.com';
const DAY = 86_400_000;

export type LoadOptions = {
  maxCommits?: number; // live: 1,000; presets: unlimited
  days?: number; // length of the window after the first commit
  maxRequests?: number;
  token?: string; // only used by the preset script
  fetch?: typeof fetch;
  onProgress?: (commits: number) => void;
};

export class RepoError extends Error {
  constructor(
    public kind: 'not-found' | 'rate-limited' | 'empty' | 'network',
    message: string,
    public resetAt?: Date,
  ) {
    super(message);
  }
}

type ApiCommit = {
  sha: string;
  author: { login: string; avatar_url: string; type?: string } | null;
  commit: { author: { name: string; date: string } | null; message: string };
};

function lastPage(link: string | null): number {
  const m = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : 1;
}

export function firstLine(message: string): string {
  const line = (message.split('\n')[0] ?? '').trim();
  return line.length > 90 ? line.slice(0, 89) + '…' : line;
}

/**
 * The first year of a repository's default branch, oldest commit first, capped at `maxCommits`.
 * GitHub lists commits newest first, so the pages are read from the last one backwards.
 */
export async function loadRepo(ref: RepoRef, opts: LoadOptions = {}): Promise<Song> {
  const { maxCommits = 1000, days = 365, maxRequests = 13, token, onProgress } = opts;
  const doFetch = opts.fetch ?? fetch;
  let requests = 0;

  async function get(path: string): Promise<Response> {
    if (requests >= maxRequests) throw new RepoError('network', 'Too many requests for one repository.');
    requests++;
    let res: Response;
    try {
      res = await doFetch(API + path, {
        headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      throw new RepoError('network', 'Could not reach GitHub. Check your connection and try again.');
    }
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      throw new RepoError('rate-limited', "GitHub's limit for anonymous visitors is used up.", reset ? new Date(reset * 1000) : undefined);
    }
    if (res.status === 404) throw new RepoError('not-found', "Couldn't find that repository.");
    if (res.status === 409) throw new RepoError('empty', 'No commits to play yet.'); // GitHub answers 409 for an empty repository
    if (!res.ok) throw new RepoError('network', `GitHub answered ${res.status}. Try again in a moment.`);
    return res;
  }

  const repoRes = await get(`/repos/${ref.owner}/${ref.name}`);
  const repoInfo = (await repoRes.json()) as { full_name: string };

  const first = await get(`/repos/${ref.owner}/${ref.name}/commits?per_page=100&page=1`);
  const last = lastPage(first.headers.get('link'));
  const firstPage = (await first.json()) as ApiCommit[];
  if (!firstPage.length) throw new RepoError('empty', 'No commits to play yet.');

  const raw: ApiCommit[] = [];
  let limitT = Infinity;
  let capped = false;
  outer: for (let page = last; page >= 1; page--) {
    if (page !== 1 && requests >= maxRequests) {
      capped = true; // out of request budget: play what we have
      break;
    }
    const items: ApiCommit[] =
      page === 1 ? firstPage : ((await (await get(`/repos/${ref.owner}/${ref.name}/commits?per_page=100&page=${page}`)).json()) as ApiCommit[]);
    // Each page is newest first; walk it oldest first.
    for (const c of [...items].reverse()) {
      const t = Date.parse(c.commit.author?.date ?? '');
      if (!Number.isFinite(t)) continue;
      if (limitT === Infinity) limitT = t + days * DAY;
      if (t > limitT) break outer;
      raw.push(c);
      if (raw.length >= maxCommits) {
        capped = true;
        break outer;
      }
    }
    onProgress?.(raw.length);
  }
  if (!raw.length) throw new RepoError('empty', 'No commits to play yet.');

  // Author times can be out of order (rebases, cherry-picks); play them in time order, keeping list order for ties.
  const ordered = raw.map((c, i) => ({ c, i, t: Date.parse(c.commit.author!.date) })).sort((x, y) => x.t - y.t || x.i - y.i);

  const authors: Author[] = [];
  const index = new Map<string, number>();
  const commits: Commit[] = ordered.map(({ c, t }) => {
    const login = c.author?.login ?? null;
    const name = c.commit.author?.name || login || 'unknown';
    const key = login ? login.toLowerCase() : `name:${name}`;
    let a = index.get(key);
    if (a === undefined) {
      a = authors.length;
      index.set(key, a);
      authors.push({
        key,
        login,
        name: c.commit.author?.name || login || 'unknown',
        avatar: c.author?.avatar_url ? `${c.author.avatar_url}${c.author.avatar_url.includes('?') ? '&' : '?'}s=80` : null,
        bot: !!login && (login.endsWith('[bot]') || c.author?.type === 'Bot'),
      });
    }
    return { t, a, sha: c.sha.slice(0, 7), msg: firstLine(c.commit.message) };
  });

  return {
    repo: repoInfo.full_name,
    source: 'live',
    window: { from: new Date(commits[0].t).toISOString(), to: new Date(commits[commits.length - 1].t).toISOString(), capped },
    authors,
    commits,
  };
}
