<p align="center">
  <picture>
    <source srcset="./fork-assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="./fork-assets/logo-light.svg" media="(prefers-color-scheme: light)">
    <img src="./fork-assets/logo-light.svg" alt="openagent logo">
  </picture>
</p>
<p align="center">Open source solution for Context and Workflow Engineering.</p>
<p align="center">Experimental Fork of <a href="https://github.com/sst/opencode">opencode</a></p>

opencode is an open sourced terminal-based AI code assistant similar to claude code. This fork allows building specialized agents with:
- **Focused prompts** - No conflicting instructions
- **Custom tools** - Only what they need for their job
- **Engineered context** - Relevant files loaded automatically
- **Clear boundaries** - Agents can't accidentally break things outside their scope

*This fork explores agent specialization patterns with the intention of contributing back working solutions to the main [opencode project](https://github.com/sst/opencode).*

## Core Principles

#### Higher the Scale, Lower the IQ - More Process & Specialization Needed
A single AI trying to handle a 100k+ line codebase is like asking one person to be the entire engineering team. The cognitive load is too high - they make mistakes, get confused between contexts, and produce inconsistent results.

**The solution?** Break down the complex tasks into focused specialists that excel at their narrow domain.

#### Make Deterministic Logic Deterministic
Don't tell agents "how" to run commands - they'll make mistakes. Instead:
- Create dedicated tools for common operations (git commits, package installation, test running)
- Set permissions at the tool level, not in prompts
- Make it impossible for agents to do the wrong thing, rather than telling them not to

#### Context Engineering for Engineers
Don't ask agents to "open file X and look for Y" repeatedly. Instead:
- **Programmatically** load relevant files and presuppose built artifacts into their context
- Replace "if this then that" logic from prompts with prompt variants for different conditions
- Do not repeat yourself, have the context always up to date

#### Load only what's needed for the job 
The more tools the dumber the agent as it gets overloaded with tool's descriptions and definitions. Picking only the right tools for the job allows you to **unleash power of MCP tools** as having multiple MCP clients does not overwhelm agents.

MCP tools are in their infancy age, and they are not as reliable as they should be. Having custom tools **allows building your own integrations** using plain, reliable HTTP APIs


### Getting Started

**1. Install**
```bash
$ npm install --global openagent-ai
# or
$ pnpm install --global openagent-ai
```

**2. Configure Your Project**
Create `openagent.ts` in your project directory:
```typescript
import { OpenAgent } from 'openagent-ai';
import { prototypeAgent, implementerAgent, qaAgent } from './agents';

export default {
  // your existing opencode configuration  
  agents: [prototypeAgent, implementerAgent, qaAgent]
}
```

**3. Run Your First Agent**
```bash
# Start interactive session
$ openagent agent planner

# Get a quick documentation for a TypeScript file
$ openagent agent tsdoc --mode run -c {"filePath": "src/your-file-to-document.ts"}
```

**4. Integrate with Your Workflow**
Add to `package.json` for convenience:
```json
{
  "scripts": {
    "ai:prototype": "openagent agent prototype",
    "ai:implement": "openagent agent implementer",
    "ai:qa": "openagent agent qa"
  }
}
```

#### Anatomy of the agent

An agent consists of three main parts:
1. **Parameter Schema** - What inputs the agent accepts from CLI/API
2. **Context Engineering** - Load and prepare all relevant information
3. **Dynamic Setup** - Configure tools and prompts based on loaded context

This separation allows you to validate inputs early, load context once, and dynamically configure agents based on the specific task.

```typescript
export const exampleAgent = Agent.define(
  "agent-id",
  "Short description",

  // 1. Parameter Schema - Input validation and typing
  z.object({
    filePath: z.string(),
    selection: z.string().optional(),
    feature: z.string().optional(),
  }).optional(),

  // 2. Context Engineering - Load relevant information
  async ({ filePath, selection, feature } = {}, services) => {
    const readme = await Bun.file(`${import.meta.dir}/../README.md`).text();
    const fileStructure = await loadFileStructure(`${import.meta.dir}/..`, {
      include: ["**/*.ts", "**/*.json"],
      exclude: ["**/*.test.ts", "**/*.mock.ts", "packages/web"],
    });

    return {
      filePath,
      feature,
      message: `${createSystemMessage(feature)}
${envPrompt(services)}
<project-description>\n${readme}\n</project-description>
<file-structure>\n${fileStructure}\n</file-structure>
${await preloadedFilePrompt(services, filePath)} // service allow to mark file as read so agent can immediately update it, if there was no change in the mean time
${selectPrompt(selection)}`,
    };
  },

  // 3. Dynamic Setup - Configure tools and prompts
  ({ message, feature }) => ({
    tools: [
      ...BUILD_IN_TOOLS(),
      gitCommitTool({ prefix: "bugfix", feature }),
      addPackageTool({ include: ["server"] }),
      runTestTool(),
    ],
    message,
  }),
);
```

### Workflow with Agents

#### Example: Adding User Authentication

1. **Planning Phase**
   ```bash
   $ openagent agent planner --context '{"filePath": "./specifications/jwt-auth.md"}' "Add user authentication with JWT tokens"
   ```
   Creates `PLAN.md` with implementation steps, API design, and file structure

2. **Architecture Phase**
   ```bash
   $ openagent agent architect --context '{"filePath": "./specifications/jwt-auth.md"}' "Review the plan ant create API contracts, interface specifications and database schema"
   ```
   Defines interfaces, database schema, and API contracts

3. **TDD Phase**
   ```bash
   $ openagent agent qa --context '{"filePath": "./specifications/jwt-auth.md"}' "Discuss with me test cases that should be implemented for the auth feature"
   ```
   Creates test suite after discuss it first (all tests initially fail)

4. **Implementation Phase**
   ```bash
   $ openagent agent implementer --context '{"filePath": "./specifications/jwt-auth.md"}' "Implement auth according to plan, make tests pass"
   ```
   Writes code to satisfy the tests and requirements

#### Parallel Development
For larger features, run specialized agents in parallel:
- **Backend implementer** - Handles API and database logic
- **Frontend implementer** - Focuses on UI components and state management

### Agent Examples

> **Note:** All agent prompts are work in progress and subject to change.

#### Core Development Workflow
- **[planner](./examples/agents/planner)** - Creates detailed implementation plans with steps and requirements
- **[architect](./examples/agents/architect)** - Designs APIs, interfaces, and system structure
- **[implementer](./examples/agents/implementer)** - Writes code according to specs, doesn't modify tests
- **qa** *(upcoming)* - Writes and runs tests, performs code quality checks
- **[prototype](./examples/agents/prototype)** - Builds quick working solutions, ignores linting/tests for speed

#### Specialized Development
- **[tsdoc](./examples/agents/tsdoc)** - Generates TypeScript documentation for better code understanding
- **[toolsmith](./examples/agents/toolsmith)** - Helps build custom tools for other agents
- **[professor](./examples/agents/professor)** - Assists in designing and improving agent prompts
- **reviewer** *(upcoming)* - Analyzes git changes and provides feedback
- **coordinator** *(upcoming)* - Selects appropriate agents for tasks and orchestrates workflows

#### Future: Non-Coding Agents
- **researcher** *(upcoming)* - Deep research with web search and knowledge base integration
- **question** *(upcoming)* - General Q&A with web research capabilities
- **language-teacher** *(upcoming)* - Interactive language learning with level-appropriate conversations

### Available Tools

> **Note:** Tools are work in progress and subject to change.

#### Core Tools
- **[save](./examples/tools/save.ts)** - Save to a specific file given in the configuration, prevents agents from writing to unauthorized files
- **[refresh](./examples/tools/refresh.ts)** - Refreshes the file given in the configuration, useful if the file was modified by someone else since last agent read
- **[git-commit](./examples/tools/git-commit.ts)** - Git commits with proper prefixes, feature names, and staging
- **[git-status](./examples/tools/git-status.ts)** - Shows git status for agent awareness
- **[add-package](./examples/tools/add-package.ts)** - Handles package installation in monorepo setups
- **run-test** *(upcoming)* - Runs tests for specific files or directories
- **history** *(upcoming)* - Shows git history for agent context *(upcoming)*
- **commit-read** *(upcoming)* - Reads recent commits for context *(upcoming)*

#### Future Vision

In a ideal world we would have an ecosystem of reusable and composable tools and agents distributed as separate packages, so that you can easily install them and use in your projects.

The idea is to have:
- Community-contributed specialized agents
- Industry-specific tool packages
- Standardized agent interfaces
- Composable AI development workflows

### Tips

#### Integrate with your IDE
You can use openagent with your IDE, you can make launch script for VSCode or webstorm, to run agents and tools directly from the editor.

Use (run-agent.ts) <path> <selection> <prompt> - you can define mapping for the agent to pick for a given path

Webstorm config
```
File: agents/scripts/run-agent.ts
Application argbument: $FilePath$ $SelectedText$ $Prompt$
```


#### Git worktree
Make multiple direcotries for your agent to run in parallel, sharing the same git repository.
```bash
$ git worktree add -b <branch> <directory>
```

Recommended plugin [Git Workree](https://plugins.jetbrains.com/plugin/23813-git-worktree) For JetBrains IDEs.


### Documentation
For more info on how to configure opencode [**head over to opencode docs**](https://opencode.ai/docs).

### Contributing
This project is **not** meant to be a long term fork of opencode, but rather a working proof of concept. 

Contripution to agents and examples have very well come. 
If you would like the core part of the application please head to the [opencode repository](https://github.com/sst/opencode).

Thanks to the authors of opencode for creating and maintaining this amazing initiative and making the code base easy to work with.
