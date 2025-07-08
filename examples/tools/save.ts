import * as path from "path"
import { z } from "zod"
import { Tool } from "openagent-ai"

export const saveConfirmPrompt = (tool = "save") =>
  `Use ${tool} tool to update it. Do it only when requested by the user.`

export const save = (filePath: string) =>
  Tool.define({
    id: "save",
    description: `Saves content to the target file specified in agent context
- Completely replaces file contents with the provided content
- Target file path is determined by the user and it is a file provided in the context

Use this tool when you have content ready to save.
`,
    parameters: z.object({
      content: z.string().describe("The content to write to the file"),
    }),
    async execute(params, { services }) {
      const projectPath = services.appInfo.path.cwd

      const filePathAbs = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectPath, filePath)

      await services.assertFileWasNotModified(filePathAbs, "refresh")
      await Bun.write(filePathAbs, params.content)
      await services.fileDiagnostics(filePathAbs)
      await services.markFileAsRead(filePathAbs)

      const output = ""
      return {
        metadata: {
          filepath: filePathAbs,
          title: path.relative(projectPath, filePathAbs),
        },
        output,
      }
    },
  })
