export type Author = {
  key: string; // GitHub login (lower case), or "name:<author name>" when the commit has no linked account
  login: string | null;
  name: string;
  avatar: string | null;
  bot: boolean;
};

export type Commit = {
  t: number; // author time, ms since epoch (UTC)
  a: number; // index into Song.authors
  sha: string; // first 7 characters
  msg: string; // first line, at most 90 characters
};

export type Song = {
  repo: string; // owner/name
  source: 'preset' | 'live';
  window: { from: string; to: string; capped: boolean };
  authors: Author[];
  commits: Commit[]; // oldest first
};
