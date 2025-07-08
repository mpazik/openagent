#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import micromatch from "micromatch";

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".DS_Store",
  "dist",
  "build",
  ".vscode",
  ".idea",
  "*.log",
  ".env*",
  "target",
];

interface TreeOptions {
  maxDepth?: number;
  include?: string[];
  exclude?: string[];
}

/**
 * Generates a tree structure string representation of a directory
 */
export function generateDirectoryTree(
  rootPath: string,
  options: TreeOptions = {},
): string {
  const { maxDepth = 12, include = [], exclude = [] } = options;

  const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...exclude];

  const lines: string[] = [];

  const normalizedRoot = path.resolve(rootPath);

  lines.push(path.basename(normalizedRoot));

  function shouldIgnore(filePath: string, fileName: string): boolean {
    return ignorePatterns.some(
      (pattern) =>
        micromatch.isMatch(fileName, pattern) ||
        micromatch.isMatch(filePath, pattern),
    );
  }

  function shouldInclude(filePath: string): boolean {
    if (include.length === 0) return true;
    return include.some((pattern) => micromatch.isMatch(filePath, pattern));
  }

  function hasVisibleContent(dirPath: string): boolean {
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      return items.some((item) => {
        const itemPath = path.join(dirPath, item.name);
        if (shouldIgnore(itemPath, item.name)) return false;

        if (item.isDirectory()) {
          return hasVisibleContent(itemPath);
        } else {
          return shouldInclude(itemPath);
        }
      });
    } catch {
      return false;
    }
  }

  function traverse(
    dirPath: string,
    prefix: string = "",
    depth: number = 0,
  ): void {
    if (depth >= maxDepth) return;

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });

      const filteredItems = items.filter((item) => {
        const itemPath = path.join(dirPath, item.name);
        if (shouldIgnore(itemPath, item.name)) return false;

        if (item.isDirectory()) {
          return hasVisibleContent(itemPath);
        } else {
          return shouldInclude(itemPath);
        }
      });

      // Sort items: directories first, then files
      filteredItems.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      filteredItems.forEach((item) => {
        const itemPath = path.join(dirPath, item.name);
        const isDirectory = item.isDirectory();

        const itemName = isDirectory ? `[${item.name}]` : item.name;
        lines.push(`${prefix}- ${itemName}`);

        if (isDirectory) {
          traverse(itemPath, prefix + "  ", depth + 1);
        }
      });
    } catch (error) {
      console.error(`Error reading directory ${dirPath}: ${error}`);
    }
  }

  traverse(normalizedRoot);

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(process.env);
  const args = process.argv.slice(2);
  const rootPath = args[0] || ".";
  const includePatterns = args.slice(1).filter((arg) => arg.length > 0);

  console.log(
    generateDirectoryTree(rootPath, {
      include: includePatterns,
    }),
  );
}
