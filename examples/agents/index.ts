import { questionAgent } from "./question.ts"
import { toolsmithAgent } from "./toolsmith.ts"
import { professorAgent } from "./professor.ts"
import { tsdocAgent } from "./tsdoc.ts"
import { scriptAgent } from "./script.ts"
import { planAgent } from "./plan.ts"
import { docAgent } from "./documentation.ts"
import { implementationAgent } from "./implementation.ts"
import { prototypeAgent } from "./prototype.ts"

export const CUSTOM_AGENTS = [
  questionAgent,
  toolsmithAgent,
  professorAgent,
  tsdocAgent,
  scriptAgent,
  planAgent,
  docAgent,
  prototypeAgent,
  implementationAgent,
]
