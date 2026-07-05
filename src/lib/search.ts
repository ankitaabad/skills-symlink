import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Skill } from '../types.js';

export type SearchHit = {
  skill: Skill;
  matches: SearchMatch[];
};

export type SearchMatch = {
  field: 'name' | 'description' | 'body';
  snippet: string;
  line?: number;
};

function normalize(s: string): string {
  return s.toLowerCase();
}

export function searchInSkills(skills: Skill[], query: string): SearchHit[] {
  const q = normalize(query.trim());
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const skill of skills) {
    const matches: SearchMatch[] = [];
    if (normalize(skill.name).includes(q)) {
      matches.push({ field: 'name', snippet: skill.name });
    }
    if (skill.description && normalize(skill.description).includes(q)) {
      matches.push({ field: 'description', snippet: skill.description });
    }
    const body = skill.description; // body content is already in description if extracted; full body is loaded in the next step
    void body;
    hits.push({ skill, matches });
  }
  return hits.filter((h) => h.matches.length > 0);
}

export async function searchInBody(
  skills: Skill[],
  query: string,
  options: { line?: number } = {},
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const rg = findRipgrep();
  if (rg) {
    return searchWithRipgrep(skills, q, rg, options);
  }
  return searchPlain(skills, q);
}

function findRipgrep(): string | null {
  const r = spawnSync('rg', ['--version'], { stdio: 'ignore' });
  return r.status === 0 ? 'rg' : null;
}

async function searchWithRipgrep(
  skills: Skill[],
  query: string,
  rg: string,
  options: { line?: number },
): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  for (const skill of skills) {
    const args = ['--json', '-i', '-n', '-e', query, skill.skillMd];
    const result = spawnSync(rg, args, { encoding: 'utf8' });
    if (result.status === 1) continue;
    if (result.status !== 0 && result.status !== 1) continue;
    if (!result.stdout) continue;
    const matches: SearchMatch[] = [];
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as { type: string; data?: { line_number?: number; line?: { text?: string } } };
        if (evt.type === 'match' && evt.data) {
          matches.push({
            field: 'body',
            line: evt.data.line_number,
            snippet: (evt.data.line?.text ?? '').trim().slice(0, 200),
          });
        }
      } catch {
        // ignore non-JSON
      }
    }
    if (matches.length > 0) out.push({ skill, matches });
  }
  if (options.line !== undefined) {
    for (const hit of out) {
      hit.matches = hit.matches.filter((m) => m.line === options.line);
    }
  }
  return out.filter((h) => h.matches.length > 0);
}

async function searchPlain(skills: Skill[], query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  const out: SearchHit[] = [];
  for (const skill of skills) {
    let body = '';
    try {
      body = await fs.readFile(skill.skillMd, 'utf8');
    } catch {
      continue;
    }
    const matches: SearchMatch[] = [];
    body.split('\n').forEach((line, i) => {
      if (line.toLowerCase().includes(q)) {
        matches.push({ field: 'body', line: i + 1, snippet: line.trim().slice(0, 200) });
      }
    });
    if (matches.length > 0) out.push({ skill, matches });
  }
  return out;
}
