import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Project } from './schema';
import { checkProject } from './check';

/** Where a project name resolves: a path to a .ts file, projects/<name>.config.ts, or examples/<name>.config.ts. */
export function configPath(name: string): string {
  if (name.endsWith('.ts')) return path.resolve(name);
  for (const dir of ['projects', 'examples']) {
    const f = path.resolve(dir, `${name}.config.ts`);
    if (fs.existsSync(f)) return f;
  }
  return path.resolve('projects', `${name}.config.ts`);
}

export async function loadProject(name: string): Promise<Project> {
  const file = configPath(name);
  if (!fs.existsSync(file)) throw new Error(`No project "${name}". Make one from a URL:  npm run make -- https://your-site.com`);
  const mod = await import(pathToFileURL(file).href);
  const p: Project = mod.default?.default ?? mod.default;
  const problems = checkProject(p);
  if (problems.length) throw new Error(`config ${file}:\n  ${problems.join('\n  ')}`);
  return p;
}
