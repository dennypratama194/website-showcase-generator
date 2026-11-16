import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Project } from './schema';
import { checkProject } from './check';

export async function loadProject(name: string): Promise<Project> {
  const file = name.endsWith('.ts') ? path.resolve(name) : path.resolve('projects', `${name}.config.ts`);
  const mod = await import(pathToFileURL(file).href);
  const p: Project = mod.default?.default ?? mod.default;
  const problems = checkProject(p);
  if (problems.length) throw new Error(`config ${file}:\n  ${problems.join('\n  ')}`);
  return p;
}
