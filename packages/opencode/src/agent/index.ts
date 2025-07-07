import { z } from "zod"
import { type StandardSchemaV1 } from "@standard-schema/spec"
import type { Tool } from "../tool/tool"

export namespace Agent {
  const Header = z.object({
    id: z.string(),
    description: z.string(),
  })
  export type Header = z.infer<typeof Header>

  export const Config = z.object({
    model: z.string().optional().describe("Model to use for the agent."),
    message: z
      .string()
      .describe(
        "System message for LLM client. When undefined, default system message will be used",
      )
      .optional(),
    tools: z
      .array(z.union([z.string(), z.custom<Tool.Info>()]))
      .describe("When undefined, all default tools will be provided")
      .optional(),
  })
  export type Config = z.infer<typeof Config>

  export interface Services {
    /**
     * Before read or edit operation file needs to be marked as read, to ensure it is not stale. Use it if you are going to have custom tools for reading files
     */
    markFileAsRead: (filepath: string) => Promise<void>
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

  export const Context = z
    .record(z.unknown())
    .describe(
      "Context passed trough CLI or created during agent loading, used for agent setup and its tools",
    )
    .optional()
  export type Context = z.infer<typeof Context>

  export type Info<
    Parameters extends StandardSchemaV1 = StandardSchemaV1,
    Ctx extends Context = Context,
  > = Header & {
    /**
     * Schema definition for validating agent initial context from CLI or API calls.
     */
    schema?: Parameters
    /**
     * Loads context for the agent. Called with parameters from the schema that are passed from CLI or API during Session creation.
     * The returned context needs to be serializable, so it can be used when session is resumed.
     */
    load: (
      params: StandardSchemaV1.InferOutput<Parameters>,
      services: Services,
    ) => Promise<Ctx>
    /**
     * Creates agent configuration with tools for chat with LLM.
     */
    setup: (data: Ctx) => Config
  }
  export const Info = Header.extend({
    schema: z.record(z.any()).optional(),
    load: z.function(z.tuple([Context, z.any()]), z.promise(Context)),
    setup: z.function(z.tuple([Context]), Config),
  })

  export type LoadContext<Parameters extends StandardSchemaV1, Context> = (
    params: StandardSchemaV1.InferOutput<Parameters>,
    services: Services,
  ) => Promise<Context>

  type Setup<Context> = (context: Context) => Config

  export function define(id: string, description: string, config: Config): Info
  export function define<Parameters extends StandardSchemaV1<unknown, Context>>(
    id: string,
    description: string,
    schema: Parameters,
    setup: Setup<StandardSchemaV1.InferOutput<Parameters>>,
  ): Info<Parameters, StandardSchemaV1.InferOutput<Parameters>>
  export function define<
    Parameters extends StandardSchemaV1,
    Ctx extends Context,
  >(
    id: string,
    description: string,
    schema: Parameters,
    load: LoadContext<Parameters, Ctx>,
    setup: Setup<Ctx>,
  ): Info<Parameters, Ctx>

  export function define<
    Parameters extends StandardSchemaV1,
    Ctx extends Context,
  >(
    id: string,
    description: string,
    schemaOrConfig: Parameters | Config,
    loadOrSetup?:
      | LoadContext<Parameters, Ctx>
      | Setup<StandardSchemaV1.InferOutput<Parameters>>,
    setup?: Setup<Ctx>,
  ): Info<Parameters, Ctx> {
    const hasAdditionalArgs = Boolean(loadOrSetup || setup)
    const isSchema = "~standard" in schemaOrConfig

    if (!isSchema && hasAdditionalArgs) {
      throw new Error(
        "When passing a Config object, no additional arguments are allowed",
      )
    }

    if (!isSchema) {
      return {
        id,
        description,
        load: async () => ({}) as Ctx,
        setup: () => schemaOrConfig,
      }
    }

    if (!loadOrSetup) {
      throw new Error("loadOrSetup is required, when schema is provided")
    }
    const schema = schemaOrConfig

    if (setup === undefined) {
      return {
        id,
        description,
        schema,
        load: async (params) => params as Ctx,
        setup: loadOrSetup as Setup<StandardSchemaV1.InferOutput<Parameters>>,
      }
    }

    return {
      id,
      description,
      schema,
      load: loadOrSetup as LoadContext<Parameters, Ctx>,
      setup: setup,
    }
  }
}
