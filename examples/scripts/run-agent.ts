#!/usr/bin/env bun
import { existsSync } from "fs";
import { execSync } from "child_process";
import micromatch from "micromatch";

const defaultMode = "chat";

type AgentConfig = { name: string; mode: "chat" | "run" };

const pathToAgentMapping: Record<string, string | AgentConfig> = {
  "**/agents/tools/**": "toolsmith",
  "**/agents/*.ts": "prof",
  "**/scripts/**": "script",
  "*.test.ts": "test",
  "**/*.md": "doc",
};

const filePath = process.argv[2];
const selection = process.argv[3];
const promptOrPath = process.argv[4];

if (!filePath) {
  console.error("Usage: run-agent.ts <filePath> <selection?> <promptOrPath?>");
  process.exit(1);
}

const context = JSON.stringify({ filePath, selection });

function selectAgent(path: string): AgentConfig {
  for (const [pattern, agentConfig] of Object.entries(pathToAgentMapping)) {
    console.log(path, pattern, micromatch.isMatch(path, pattern));
    if (micromatch.isMatch(path, pattern)) {
      return typeof agentConfig === "string"
        ? { name: agentConfig, mode: defaultMode }
        : agentConfig;
    }
  }
  return { name: "general", mode: defaultMode };
}

function shellEscape(str: string): string {
  if (!str) return "''";

  return `'${str.replace(/'/g, "'\"'\"'")}'`;
}

function isFilePath(input: string): boolean {
  return existsSync(input);
}

const agent = selectAgent(filePath);

const baseCommand = `pnpm openagent agent ${agent.name} --mode ${agent.mode} --context ${shellEscape(context)}`;

const promptSuffix = isFilePath(promptOrPath)
  ? ` < "${promptOrPath}"`
  : ` ${shellEscape(promptOrPath)}`;

let command = `${baseCommand}${promptSuffix}`;
if (agent.mode === "chat") {
  console.log(command);
  command = `node ./agents/scripts/run-in-iterm.ts ${shellEscape(command)}`;
}

try {
  execSync(command, { stdio: "inherit" });
} catch (error) {
  console.error("❌ Command failed:", error);
  process.exit(1);
}
