export type RepoRef = { owner: string; name: string };

const NAME = /^[A-Za-z0-9_.-]+$/;

/** Accepts `owner/name` and GitHub URLs, with or without scheme, `www.`, `.git`, a trailing slash or extra path. */
export function parseRepo(input: string): RepoRef | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/i, '');
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
  const [owner, rawName] = s.split(/[/?#]/).filter(Boolean);
  if (!owner || !rawName) return null;
  const name = rawName.replace(/\.git$/i, '');
  if (!NAME.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null;
  return { owner, name };
}
