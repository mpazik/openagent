import { Config } from "../config/config"
import { MCP } from "../mcp"
import { UI } from "./ui"
import { AgentServices } from "../agent/services.ts"

export function FormatError(input: unknown) {
  if (MCP.Failed.isInstance(input))
    return `MCP server "${input.data.name}" failed. Note, opencode does not support MCP authentication yet.`
  if (Config.JsonError.isInstance(input))
    return `Config file at ${input.data.path} is not valid JSON`
  if (Config.InvalidError.isInstance(input))
    return [
      `Config file at ${input.data.path} is invalid`,
      ...(input.data.issues?.map(
        (issue) => "↳ " + issue.message + " " + issue.path.join("."),
      ) ?? []),
    ].join("\n")
  if (AgentServices.ConfigError.isInstance(input))
    return [
      `Agent '${input.data.agent}' configuration error`,
      ...(input.data.message ? [input.data.message] : []),
      ...(input.data.issues?.map(
        (issue) => "↳ " + issue.message + " " + issue.path.join("."),
      ) ?? []),
    ].join("\n")

  if (UI.CancelledError.isInstance(input)) return ""
}
