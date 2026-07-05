import matter from 'gray-matter';
import type { SkillFrontmatter } from '../types.js';

export type ParsedSkillMd = {
  data: SkillFrontmatter;
  body: string;
};

export function parseSkillMd(content: string): ParsedSkillMd {
  const parsed = matter(content);
  const data = (parsed.data ?? {}) as SkillFrontmatter;
  return { data, body: parsed.content };
}

export function extractDescription(data: SkillFrontmatter, body: string, fallback: string): string {
  if (data.description && data.description.trim().length > 0) {
    const trimmed = data.description.trim().replace(/\s+/g, ' ');
    return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
  }
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  const first = lines[0];
  if (first) {
    return first.length > 200 ? `${first.slice(0, 197)}...` : first;
  }
  return fallback;
}
