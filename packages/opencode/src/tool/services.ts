import { LSP } from "../lsp"
import { FileTime } from "../file/time"
import { Permission } from "../permission"
import { Tool } from "./tool"
import { App } from "../app/app"

// Cannot be in tools.ts as that file is exported but here are package internal functions
export namespace ToolServices {
  export function create(sessionID: string): Tool.Services {
    return {
      markFileAsRead: async (filepath: string) => {
        // just warms the lsp client
        await LSP.touchFile(filepath, false)
        FileTime.read(sessionID, filepath)
      },
      assertFileWasNotModified(filepath, suggestedReadTool) {
        return FileTime.assert(sessionID, filepath, suggestedReadTool)
      },
      permissionAsk(input) {
        return Permission.ask({
          id: input.id,
          sessionID: sessionID,
          title: input.title,
          metadata: input.metadata,
        })
      },
      fileDiagnostics: async (filepath: string) => {
        let output = ""
        await LSP.touchFile(filepath, true)
        const diagnostics = await LSP.diagnostics()
        for (const [file, issues] of Object.entries(diagnostics)) {
          if (issues.length === 0) continue
          if (file === filepath) {
            output += `\nThis file has errors, please fix\n<file_diagnostics>\n${issues.map(LSP.Diagnostic.pretty).join("\n")}\n</file_diagnostics>\n`
            continue
          }
          output += `\n<project_diagnostics>\n${file}\n${issues.map(LSP.Diagnostic.pretty).join("\n")}\n</project_diagnostics>\n`
        }
        return { diagnostics, output }
      },
      appInfo: App.info(),
    }
  }
}
