import { describe, it, expect } from 'vitest';
import { parseSkillMd, extractDescription } from '../src/lib/frontmatter.js';

describe('parseSkillMd', () => {
  it('parses YAML frontmatter and body', () => {
    const content = `---
name: mantine
description: Build React UIs with Mantine.
---

# Mantine

Use Mantine v8+ for components.
`;
    const { data, body } = parseSkillMd(content);
    expect(data.name).toBe('mantine');
    expect(data.description).toBe('Build React UIs with Mantine.');
    expect(body).toContain('# Mantine');
    expect(body).toContain('Use Mantine v8+');
  });

  it('returns empty data when no frontmatter is present', () => {
    const { data, body } = parseSkillMd('Just body text.\n');
    expect(data).toEqual({});
    expect(body).toContain('Just body text');
  });

  it('handles empty body', () => {
    const { data, body } = parseSkillMd('---\nname: foo\n---\n');
    expect(data.name).toBe('foo');
    expect(body.trim()).toBe('');
  });

  it('handles frontmatter with only some fields', () => {
    const { data, body } = parseSkillMd('---\nname: foo\n---\nbody text\n');
    expect(data.name).toBe('foo');
    expect(data.description).toBeUndefined();
    expect(body).toContain('body text');
  });
});

describe('extractDescription', () => {
  it('uses frontmatter description when present', () => {
    expect(extractDescription({ description: 'Hi' }, 'body', 'fallback')).toBe('Hi');
  });

  it('trims and collapses whitespace from frontmatter description', () => {
    expect(extractDescription({ description: '  multi   word  text  ' }, '', 'fb')).toBe(
      'multi word text',
    );
  });

  it('falls back to the first non-heading body line', () => {
    expect(extractDescription({}, '# Heading\n\nFirst real line.\nSecond.', 'fb')).toBe(
      'First real line.',
    );
  });

  it('skips all-heading bodies and returns the fallback', () => {
    expect(extractDescription({}, '# H1\n## H2\n### H3\n', 'fb')).toBe('fb');
  });

  it('returns the fallback when body and frontmatter are both empty', () => {
    expect(extractDescription({}, '', 'my fallback')).toBe('my fallback');
  });

  it('truncates long descriptions to 200 chars with ellipsis', () => {
    const long = 'a'.repeat(300);
    const result = extractDescription({ description: long }, '', 'fb');
    expect(result.length).toBe(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('truncates long body-derived descriptions too', () => {
    const long = 'b'.repeat(500);
    const result = extractDescription({}, long, 'fb');
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('uses fallback when frontmatter description is empty after trim', () => {
    expect(extractDescription({ description: '   ' }, 'body line', 'fb')).toBe('body line');
  });
});
