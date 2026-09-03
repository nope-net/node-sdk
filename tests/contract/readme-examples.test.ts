/**
 * Every ```typescript block in README.md must compile against the 4.0.0
 * surface. Blocks are extracted at test time, each becomes a standalone
 * virtual module (top-level await allowed), `@nope-net/sdk` resolves to
 * src/index.ts, and the TypeScript compiler API reports diagnostics. A small
 * ambient prelude supplies the `app` used by the webhook example.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

const PRELUDE = `
declare const app: {
  post(
    path: string,
    handler: (
      req: { body: string | Buffer; headers: Record<string, string | string[] | undefined> },
      res: { status(code: number): { send(body: string): void } }
    ) => void
  ): void;
};
`;

function extractBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:typescript|ts)\n([\s\S]*?)```/g;
  for (const m of markdown.matchAll(re)) blocks.push(m[1]);
  return blocks;
}

describe('README examples', () => {
  const blocks = extractBlocks(README);

  it('has TypeScript examples to check', () => {
    expect(blocks.length).toBeGreaterThan(8);
  });

  it('every block typechecks against src/index.ts', () => {
    const virtualDir = `${ROOT}___readme-examples/`;
    const files = new Map<string, string>();
    files.set(`${virtualDir}prelude.d.ts`, PRELUDE);
    blocks.forEach((code, i) => files.set(`${virtualDir}example-${i + 1}.ts`, code));

    const options: ts.CompilerOptions = {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      types: ['node'],
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      baseUrl: ROOT,
      paths: { '@nope-net/sdk': ['src/index.ts'] },
    };

    const host = ts.createCompilerHost(options, true);
    const realGetSourceFile = host.getSourceFile.bind(host);
    const realFileExists = host.fileExists.bind(host);
    const realReadFile = host.readFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      const virtual = files.get(fileName);
      if (virtual !== undefined) return ts.createSourceFile(fileName, virtual, languageVersion, true);
      return realGetSourceFile(fileName, languageVersion, onError, shouldCreate);
    };
    host.fileExists = (fileName) => files.has(fileName) || realFileExists(fileName);
    host.readFile = (fileName) => files.get(fileName) ?? realReadFile(fileName);

    const program = ts.createProgram([...files.keys()], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => !d.file?.fileName.includes('node_modules'));

    const formatted = diagnostics.map((d) => {
      const where = d.file ? `${d.file.fileName.replace(ROOT, '')}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : 'global';
      return `${where} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    });
    expect(formatted).toEqual([]);
  });
});
