import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { Config } from "../../config/config"
import { bootstrap } from "../bootstrap"
import { Session } from "../../session"
import { Provider } from "../../provider/provider"
import { Bus } from "../../bus"
import { Message } from "../../session/message"
import { Server } from "../../server/server"
import { Global } from "../../global"
import path from "path"
import fs from "fs/promises"
import { AgentServices } from "../../agent/services"
import { Tool } from "../../tool/tool.ts"

function getStyleForMetadata(metadata: Tool.Metadata): string {
  if (!metadata) return UI.Style.TEXT_INFO_BOLD
  if (metadata.error) return UI.Style.TEXT_DANGER_BOLD
  if (metadata.content || metadata.diff) return UI.Style.TEXT_SUCCESS_BOLD
  if (metadata.stdout) return UI.Style.TEXT_DANGER_BOLD
  if (metadata.preview) return UI.Style.TEXT_HIGHLIGHT_BOLD
  if (metadata.format) return UI.Style.TEXT_DIM_BOLD
  return UI.Style.TEXT_INFO_BOLD
}

export const AgentCommand = cmd({
  command: "agent [name] [message..]",
  describe: "run an agent by name or list available agents",
  builder: (yargs: Argv) => {
    return yargs
      .positional("name", {
        describe: "name of the agent to run",
        type: "string",
        demandOption: true,
      })
      .positional("message", {
        describe: "message to send or path to file containing message",
        type: "string",
        array: true,
        default: [],
      })
      .option("list", {
        alias: ["l"],
        type: "boolean",
        describe: "list available agents",
      })
      .option("mode", {
        describe: "mode to run the agent in",
        type: "string",
        choices: ["chat", "run"],
        default: "chat",
      })
      .option("context", {
        alias: ["c"],
        type: "string",
        describe: "additional context to pass to the agent (JSON format)",
      })
      .check((argv) => {
        if (!argv.list && !argv.name) {
          throw new Error("Agent name is required unless using --list")
        }
        return true
      })
  },
  handler: async (args) => {
    await bootstrap({ cwd: process.cwd() }, async (app) => {
      const config = await Config.get()

      if (args.list) {
        if (config.agents && config.agents.length > 0) {
          UI.println(UI.Style.TEXT_NORMAL_BOLD + "Available agents:")
          for (const agent of config.agents) {
            UI.println(
              UI.Style.TEXT_INFO +
                "  " +
                agent.id.padEnd(20) +
                UI.Style.TEXT_DIM +
                " - " +
                agent.description,
            )
          }
          UI.empty()
        } else {
          UI.empty()
          UI.println(UI.Style.TEXT_DIM + "No agents configured")
        }
        return
      }

      let message = args.message.join(" ")

      if (!process.stdin.isTTY) {
        try {
          const stdinMessage = await Bun.stdin.text()
          const trimmedMessage = stdinMessage.trim()
          if (trimmedMessage) {
            message = message ? `${message}\n${trimmedMessage}` : trimmedMessage
          }
        } catch (e) {
          console.error("Error reading stdin:", e)
        }
      }

      const agentId = args.name
      let initContext: any
      if (args.context) {
        try {
          initContext = JSON.parse(args.context)
        } catch (e) {
          UI.error(`Invalid JSON in context parameter: ${e}`)
          return
        }
      }

      const session = await Session.createForAgent(agentId, initContext)
      const agentConfig = await AgentServices.loadConfig(
        agentId,
        session.agentContext,
      )
      const model = agentConfig.model
        ? Provider.parseModel(agentConfig.model)
        : await Provider.defaultModel()
      const modelName = `${model.providerID}/${model.modelID}`

      // Chat mode - launch TUI with agent configuration
      if (args.mode === "chat") {
        const server = Server.listen({
          port: 0,
          hostname: "127.0.0.1",
        })

        let cmd = ["go", "run", "./main.go"]
        let cwd = Bun.fileURLToPath(
          new URL("../../../../tui/cmd/opencode", import.meta.url),
        )

        if (Bun.embeddedFiles.length > 0) {
          const blob = Bun.embeddedFiles[0] as File
          let binaryName = blob.name
          if (process.platform === "win32" && !binaryName.endsWith(".exe")) {
            binaryName += ".exe"
          }
          const binary = path.join(Global.Path.cache, "tui", binaryName)
          const file = Bun.file(binary)
          if (!(await file.exists())) {
            await Bun.write(file, blob, { mode: 0o755 })
            await fs.chmod(binary, 0o755)
          }
          cwd = process.cwd()
          cmd = [binary]
        }

        const proc = Bun.spawn({
          cmd: [...cmd, ...process.argv.slice(2)],
          cwd,
          stdout: "inherit",
          stderr: "inherit",
          stdin: "inherit",
          env: {
            ...process.env,
            OPENCODE_SERVER: server.url.toString(),
            OPENCODE_APP_INFO: JSON.stringify(app),
            OPENCODE_SESSION: session.id,
            OPENCODE_MODEL: modelName, // temporary hack for TUI - should be read from the session, as the model is always read from agent config if exists. TUI allows dynamic switching that would change UI but not agent.
            ...(message && { OPENCODE_INIT_MESSAGE: message }),
          },
          onExit: () => {
            server.stop()
          },
        })

        await proc.exited
        server.stop()
      } else {
        // Run mode - execute non-interactively
        if (!message) {
          UI.error("Message is required for run mode")
          return
        }

        const agentConfig = await AgentServices.get(agentId)

        UI.empty()
        UI.println(UI.logo())
        UI.empty()
        UI.println(UI.Style.TEXT_NORMAL_BOLD + "Agent: ", agentId)
        UI.println(UI.Style.TEXT_DIM + "Description: ", agentConfig.description)
        if (initContext && Object.keys(initContext).length > 0)
          UI.println(
            UI.Style.TEXT_DIM + "Initial Context: ",
            UI.formatJson(initContext),
          )
        UI.empty()
        UI.println(UI.Style.TEXT_NORMAL_BOLD + "> ", message)
        UI.empty()
        UI.println(
          UI.Style.TEXT_NORMAL_BOLD + "@ ",
          UI.Style.TEXT_NORMAL + modelName,
        )
        UI.empty()

        function printEvent(color: string, type: string, title: string) {
          UI.println(
            color + `|`,
            UI.Style.TEXT_NORMAL +
              UI.Style.TEXT_DIM +
              ` ${type.padEnd(7, " ")}`,
            "",
            UI.Style.TEXT_NORMAL + title,
          )
        }

        Bus.subscribe(Message.Event.PartUpdated, async (evt) => {
          if (evt.properties.sessionID !== session.id) return
          const part = evt.properties.part
          const message = await Session.getMessage(
            evt.properties.sessionID,
            evt.properties.messageID,
          )

          if (
            part.type === "tool-invocation" &&
            part.toolInvocation.state === "result"
          ) {
            const metadata =
              message.metadata.tool[part.toolInvocation.toolCallId]

            printEvent(
              getStyleForMetadata(metadata),
              part.toolInvocation.toolName,
              metadata?.title || "Unknown",
            )
          }

          if (part.type === "text") {
            if (part.text.includes("\n")) {
              UI.empty()
              UI.println(part.text)
              UI.empty()
              return
            }
            printEvent(UI.Style.TEXT_NORMAL_BOLD, "Text", part.text)
          }
        })

        const result = await Session.chat({
          sessionID: session.id,
          providerID: model.providerID,
          modelID: model.modelID,
          parts: [
            {
              type: "text",
              text: message,
            },
          ],
        })

        const isPiped = !process.stdout.isTTY
        if (isPiped) {
          const match = result.parts.findLast((x) => x.type === "text")
          if (match) process.stdout.write(match.text)
        }
        UI.empty()
      }
    })
  },
})
