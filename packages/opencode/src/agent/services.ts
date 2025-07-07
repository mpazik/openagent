import type { Tool } from "../tool/tool"
import type { Agent } from "./index"
import { Config as ConfigService } from "../config/config"
import { LSP } from "../lsp"
import { FileTime } from "../file/time"
import { NamedError } from "../util/error.ts"
import { z } from "zod"
import { App } from "../app/app.ts"

// Cannot be in index.ts as that file is exported but here are package internal functions
export namespace AgentServices {
  export function createServices(sessionID: string): Agent.Services {
    return {
      markFileAsRead: async (filepath: string) => {
        // just warms the lsp client
        await LSP.touchFile(filepath, false)
        FileTime.read(sessionID, filepath)
      },
      appInfo: App.info(),
    }
  }

  export async function get(agentId: string): Promise<Agent.Info> {
    const config = await ConfigService.get()
    if (!config.agents) {
      throw new ConfigError({
        agent: agentId,
        message: "No agents configured in the config.",
      })
    }
    const agent = config.agents.find((a) => a.id === agentId)
    if (!agent) {
      throw new ConfigError({
        agent: agentId,
        message: "Agent not found in the config.",
      })
    }

    // check
    return agent as Agent.Info
  }

  export async function loadContext(
    sessionID: string,
    agentId: string,
    initContext: Agent.Context,
  ): Promise<Agent.Context> {
    const agent = await get(agentId)

    if (!agent.schema) {
      return initContext
    }

    const parsed = await agent.schema["~standard"].validate(initContext)
    if (parsed.issues) {
      throw new ConfigError({
        agent: agentId,
        message: "Invalid initial context for agent",
        issues: parsed.issues as z.ZodIssue[],
      })
    }

    const services = createServices(sessionID)
    return await agent.load(parsed.value, services)
  }

  export async function loadConfig(
    agentId: string,
    context: Agent.Context,
  ): Promise<Agent.Config> {
    const agent = await get(agentId)
    return agent.setup(context)
  }

  export async function loadTools(config: Agent.Config): Promise<{
    custom: Tool.Info[]
    buildIn: string[]
    mcp: [provider: string, tool: string[] | null][]
  } | null> {
    if (!config.tools) {
      return null
    }

    const custom: Tool.Info[] = []
    const buildIn: string[] = []
    const mcpTools = new Map<string, string[] | null>()

    for (const tool of config.tools) {
      if (typeof tool === "string") {
        if (tool.includes(":")) {
          const [provider, toolName] = tool.split(":", 2)
          if (toolName === "*") {
            mcpTools.set(provider, null)
          } else {
            const existing = mcpTools.get(provider)
            if (existing === null) {
              // Provider already has wildcard, no need to add specific tools
            } else if (existing) {
              existing.push(toolName)
            } else {
              mcpTools.set(provider, [toolName])
            }
          }
        } else {
          buildIn.push(tool)
        }
      } else {
        custom.push(tool)
      }
    }

    return {
      custom,
      buildIn,
      mcp: Array.from(mcpTools.entries()),
    }
  }

  export const ConfigError = NamedError.create(
    "AgentConfigError",
    z.object({
      agent: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.ZodIssue[]>().optional(),
    }),
  )
}
