export type SkillFrontmatter = {
  name?: string;
  description?: string;
};

export type Skill = {
  name: string;
  path: string;
  skillMd: string;
  description: string;
};

export type LoadedConfig = {
  registry: string;
  target: string;
  projectRoot: string;
  configPath: string | null;
};

export type SymlinkStatus = 'linked' | 'not-linked' | 'broken';

export type SkillWithStatus = Skill & {
  status: SymlinkStatus;
};
