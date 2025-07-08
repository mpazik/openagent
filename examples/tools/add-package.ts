import { join } from "path"
import { readdirSync, statSync, existsSync } from "fs"
import { z } from "zod"
import { spawn } from "bun"
import { Tool } from "openagent-ai"

function getAvailableWorkspaces(config: WorkspaceConfig): string[] {
  const packagesDir = join(process.cwd(), "packages")
  const workspaces = ["root"] // Always include root

  if (existsSync(packagesDir)) {
    try {
      const entries = readdirSync(packagesDir)
      for (const entry of entries) {
        const entryPath = join(packagesDir, entry)
        if (
          statSync(entryPath).isDirectory() &&
          existsSync(join(entryPath, "package.json"))
        ) {
          workspaces.push(entry)
        }
      }
    } catch (error) {
      console.warn("Could not scan packages directory:", error)
    }
  }

  let filteredWorkspaces = workspaces

  if (config.include && config.include.length > 0) {
    filteredWorkspaces = workspaces.filter((ws) => config.include!.includes(ws))
  }

  if (config.exclude && config.exclude.length > 0) {
    filteredWorkspaces = filteredWorkspaces.filter(
      (ws) => !config.exclude!.includes(ws),
    )
  }

  return filteredWorkspaces
}

interface WorkspaceConfig {
  workspacesDirectory: string
  include?: string[]
  exclude?: string[]
}

export function savePackageTool(
  config: WorkspaceConfig = { workspacesDirectory: "packages" },
) {
  const filteredWorkspaces = getAvailableWorkspaces(config)

  // Build parameter schema based on available workspaces
  const baseParameters = {
    packageName: z
      .string()
      .describe(
        "The npm package name to install (e.g., 'lodash', '@types/node'). Versions will be automatically stripped (e.g., 'lodash@4.17.21' becomes 'lodash')",
      ),
    dev: z
      .boolean()
      .optional()
      .describe(
        "Install as dev dependency. Defaults to false (regular dependency).",
      ),
  }

  // Only add workspace parameter if there are multiple workspaces
  const parametersSchema =
    filteredWorkspaces.length === 1
      ? z.object(baseParameters)
      : z.object({
          ...baseParameters,
          workspace: z
            .string()
            .refine((val) => filteredWorkspaces.includes(val), {
              message: `Workspace must be one of: ${filteredWorkspaces.join(", ")}`,
            })
            .describe(
              `The workspace where the package should be installed. 'root' installs at project level. Available workspaces: ${filteredWorkspaces.join(", ")}.`,
            ),
        })

  return Tool.define({
    id: "add-package",
    description: `Adds npm packages to specific workspaces in the monorepo
- Installs packages using pnpm in the correct workspace directory
- Supports both regular dependencies and dev dependencies
- Works with configured workspace restrictions
- Validates package names and provides installation feedback
Use this tool when you need to add dependencies to any part of the monorepo`,
    parameters: parametersSchema,
    async execute(params, ctx) {
      const { packageName: rawPackageName, dev = false } = params

      // Use the single available workspace if workspace parameter is not present
      const workspace =
        filteredWorkspaces.length === 1
          ? filteredWorkspaces[0]
          : (params as any).workspace

      // Strip version from package name if present (e.g., "lodash@4.17.21" -> "lodash")
      const packageName =
        rawPackageName.includes("@") && !rawPackageName.startsWith("@")
          ? rawPackageName.split("@")[0] // Regular package like lodash@4.17.21
          : rawPackageName.split("@").length > 2
            ? `@${rawPackageName.split("@")[1]}` // Scoped package like @types/node@1.0.0
            : rawPackageName // No version specified

      // Validate package name format (without version)
      if (
        !packageName.match(
          /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/,
        )
      ) {
        throw new Error(`Invalid package name format: ${packageName}`)
      }

      const workspacePath = workspace === "root" ? "." : `packages/${workspace}`

      // Build pnpm command
      const args = ["add"]
      if (dev) args.push("--save-dev")
      args.push(packageName)

      // Add workspace filter if not root
      if (workspace !== "root") {
        args.unshift("--filter", workspace)
      } else {
        args.unshift("--workspace-root")
      }

      const proc = spawn(["pnpm", ...args], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        throw new Error(`pnpm failed with exit code ${exitCode}: ${stderr}`)
      }

      const alreadyInstalled =
        stderr.includes("Already up to date") ||
        stdout.includes("Already up to date")

      const metadata = {
        packageName,
        originalInput: rawPackageName,
        workspace,
        isDev: dev,
        alreadyInstalled,
        workspacePath,
        title: `Package ${dev ? "(dev) " : ""}added to ${workspace}`,
        availableWorkspaces: filteredWorkspaces,
        singleWorkspace: filteredWorkspaces.length === 1,
      }

      ctx.metadata(metadata)

      return {
        metadata,
        output: alreadyInstalled
          ? `Package ${packageName} was already installed in ${workspace}${rawPackageName !== packageName ? ` (version stripped from ${rawPackageName})` : ""}`
          : `Successfully added ${packageName} ${dev ? "as dev dependency " : ""}to ${workspace} workspace${rawPackageName !== packageName ? ` (version stripped from ${rawPackageName})` : ""}\n\n${stdout}`,
      }
    },
  })
}
