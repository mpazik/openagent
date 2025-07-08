import * as path from "path"
import { z } from "zod"
import { Tool } from "openagent-ai"

export const refresh = (filePath: string) =>
  Tool.define({
    id: "refresh",
    description: `Refreshes and reads the current content of the target file
- Marks the file as read to ensure it's not stale
- Returns the complete file content
Use this tool when you need to refresh a file that may have been modified externally`,
    parameters: z.object({}),
    async execute(_params, { services }) {
      const projectPath = services.appInfo.path.cwd

      const filePathAbs = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectPath, filePath)

      const file = Bun.file(filePathAbs)
      const content = await file.text()
      await services.markFileAsRead(filePathAbs)

      const lines = content.split("\n")
      return {
        metadata: {
          filePath: filePathAbs,
          title: path.relative(projectPath, filePathAbs),
          size: content.length,
          preview: lines.slice(0, 20).join("\n"),
          lines: lines.length,
        },
        output: content,
      }
    },
  })
