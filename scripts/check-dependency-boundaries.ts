import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("src");
const forbiddenImports =
  /(?:from\s*["']|import\s*["']|import\s*\([^"']*["'])(?:kysely|pg)(?:\/|["'])|postgresql/i;
const violations: string[] = [];

async function inspectDirectory(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspectDirectory(entryPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const relativePath = path.relative(sourceRoot, entryPath).replaceAll(path.sep, "/");
    const isCoreLayer =
      /(?:^|\/)(?:domain|application)(?:\/|$)/.test(relativePath) ||
      /^shared\/(?:domain|application)\//.test(relativePath);
    if (!isCoreLayer) continue;

    const source = await readFile(entryPath, "utf8");
    if (forbiddenImports.test(source)) violations.push(relativePath);
  }
}

async function main(): Promise<void> {
  await inspectDirectory(sourceRoot);

  if (violations.length > 0) {
    process.stderr.write(
      `Persistence imports are not allowed in domain/application: ${violations.join(", ")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Architecture dependency boundaries passed.\n");
  }
}

void main();
