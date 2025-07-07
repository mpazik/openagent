import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { Diagnostic as VSCodeDiagnostic } from "vscode-languageserver-types"

export namespace Tool {
  export interface Metadata {
    title: string

    // Optional fields for enhanced TUI display
    content?: string
    diff?: string
    stdout?: string
    format?: "html" | "markdown"
    diagnostics?: Record<string, VSCodeDiagnostic[]>
    error?: boolean
    message?: string
    preview?: string

    [key: string]: any
  }

  export interface Services {
    /**
     * Before read or edit operation file needs to be marked as read, to ensure it is not stale. Use it if you are going to have custom tools for reading files
     */
    markFileAsRead: (filepath: string) => Promise<void>
    /**
     * This function will throw an error if the file was modified since it was last read. The exception has been converted to a format understood by LLM, requesting file read
     * @param filepath - The path to the file to read
     * @param suggestedReadTool - If provided, it will be used to suggest the tool to read the file, by default, it will use "read" tool
     */
    assertFileWasNotModified: (
      filepath: string,
      suggestedReadTool?: string,
    ) => Promise<void>
    /**
     * Prompts the user for permission to perform given operation. It will use id to identify the permission request, and validate if permission was granted or explicitly declined before.
     *
     * It will throw an error if the user has declined the permission before, or if the user has not granted the permission yet. The exception will be converted to a format understood by LLM.
     *
     * @Note: This function is not fully implemented yet.
     */
    permissionAsk: (input: {
      id: string
      title: string
      metadata: Record<string, any>
    }) => Promise<void> | undefined

    /**
     * Performs LSP diagnostics on the file, and returns the output in a format understood by LLM. Use it after modifying the file to check for errors.
     * @param filepath
     */
    fileDiagnostics: (filepath: string) => Promise<{
      output: string
      // do not import it from LSP, to avoid dependencies in the exported types
      diagnostics: Record<string, VSCodeDiagnostic[]>
    }>
    /**
     * Returns basic information about the application
     */
    appInfo: {
      user: string
      hostname: string
      git: boolean
      path: {
        config: string
        data: string
        root: string
        cwd: string
        state: string
      }
      time: {
        initialized?: number
      }
    }
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    abort: AbortSignal
    metadata(meta: M): void
    services: Services
  }

  export interface Info<
    Parameters extends StandardSchemaV1 = StandardSchemaV1,
    M extends Metadata = Metadata,
  > {
    id: string
    description: string
    parameters: Parameters
    execute(
      args: StandardSchemaV1.InferOutput<Parameters>,
      ctx: Context,
    ): Promise<{
      metadata: M
      output: string
    }>
  }

  export function define<
    Parameters extends StandardSchemaV1,
    Result extends Metadata,
  >(input: Info<Parameters, Result>): Info<Parameters, Result> {
    return input
  }
}
