import { z } from "zod"
import { Tool } from "openagent-ai"

export const gitStatus = Tool.define({
  id: "git-status",
  description: `Shows the current status of the git repository including staged, unstaged, and untracked files
- Lists modified, added, deleted, and untracked files
- Shows if the working directory is clean or has pending changes
Use this tool when you need to check what changes are ready to commit or understand the current state of your repository`,
  parameters: z.object({
    showUntracked: z
      .boolean()
      .optional()
      .describe(
        "Whether to include untracked files in the output. Defaults to true.",
      ),
  }),
  async execute(params): Promise<{
    metadata: Tool.Metadata
    output: string
  }> {
    const { showUntracked = true } = params

    try {
      // Check if we're in a git repository
      const gitCheck = Bun.spawn(["git", "rev-parse", "--git-dir"], {
        stdout: "pipe",
        stderr: "pipe",
      })

      const gitCheckExit = await gitCheck.exited
      if (gitCheckExit !== 0) {
        throw new Error("Not in a git repository")
      }

      // Get current branch information
      const branchProc = Bun.spawn(["git", "branch", "--show-current"], {
        stdout: "pipe",
        stderr: "pipe",
      })

      const branchOutput = await new Response(branchProc.stdout).text()
      const branchExit = await branchProc.exited
      const currentBranch = branchExit === 0 ? branchOutput.trim() : "unknown"

      // Get remote tracking information
      const remoteProc = Bun.spawn(
        ["git", "status", "--porcelain=v1", "--branch"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      )

      const remoteOutput = await new Response(remoteProc.stdout).text()
      const remoteExit = await remoteProc.exited

      if (remoteExit !== 0) {
        throw new Error("Failed to get git status")
      }

      // Parse the output
      const lines = remoteOutput.trim().split("\n")
      const branchLine = lines[0]
      let ahead = 0
      let behind = 0
      let trackingBranch = ""

      // Parse branch tracking info
      if (branchLine.startsWith("##")) {
        const branchInfo = branchLine.substring(3)
        const trackingMatch = branchInfo.match(
          /(.+?)\.\.\.(.+?)(?:\s+\[(.+?)\])?$/,
        )
        if (trackingMatch) {
          trackingBranch = trackingMatch[2]
          const statusInfo = trackingMatch[3]
          if (statusInfo) {
            const aheadMatch = statusInfo.match(/ahead (\d+)/)
            const behindMatch = statusInfo.match(/behind (\d+)/)
            if (aheadMatch) ahead = parseInt(aheadMatch[1])
            if (behindMatch) behind = parseInt(behindMatch[1])
          }
        }
      }

      // Parse file changes
      const fileLines = lines.slice(1).filter((line) => line.trim())
      const staged: string[] = []
      const unstaged: string[] = []
      const untracked: string[] = []
      const deleted: string[] = []

      for (const line of fileLines) {
        if (line.length < 3) continue

        const indexStatus = line[0]
        const workTreeStatus = line[1]
        const fileName = line.substring(3)

        // Staged changes
        if (indexStatus !== " " && indexStatus !== "?") {
          if (indexStatus === "D") {
            deleted.push(fileName)
          } else {
            staged.push(fileName)
          }
        }

        // Unstaged changes
        if (workTreeStatus !== " " && workTreeStatus !== "?") {
          if (workTreeStatus === "D") {
            deleted.push(fileName)
          } else {
            unstaged.push(fileName)
          }
        }

        // Untracked files
        if (indexStatus === "?" && workTreeStatus === "?") {
          untracked.push(fileName)
        }
      }

      // Build output
      let output = `Branch: ${currentBranch}`

      if (trackingBranch) {
        output += `\nTracking: ${trackingBranch}`
        if (ahead > 0)
          output += `\nAhead by ${ahead} commit${ahead > 1 ? "s" : ""}`
        if (behind > 0)
          output += `\nBehind by ${behind} commit${behind > 1 ? "s" : ""}`
      }

      const totalChanges =
        staged.length +
        unstaged.length +
        (showUntracked ? untracked.length : 0) +
        deleted.length

      if (totalChanges === 0) {
        output += "\n\nWorking directory clean"
      } else {
        output += "\n"

        if (staged.length > 0) {
          output += `\nStaged for commit (${staged.length} file${staged.length > 1 ? "s" : ""}):\n`
          staged.forEach((file) => (output += `  + ${file}\n`))
        }

        if (unstaged.length > 0) {
          output += `\nUnstaged changes (${unstaged.length} file${unstaged.length > 1 ? "s" : ""}):\n`
          unstaged.forEach((file) => (output += `  M ${file}\n`))
        }

        if (deleted.length > 0) {
          output += `\nDeleted files (${deleted.length} file${deleted.length > 1 ? "s" : ""}):\n`
          deleted.forEach((file) => (output += `  D ${file}\n`))
        }

        if (showUntracked && untracked.length > 0) {
          output += `\nUntracked files (${untracked.length} file${untracked.length > 1 ? "s" : ""}):\n`
          untracked.forEach((file) => (output += `  ? ${file}\n`))
        }
      }

      return {
        metadata: {
          branch: currentBranch,
          trackingBranch,
          ahead,
          behind,
          staged: staged.length,
          unstaged: unstaged.length,
          untracked: untracked.length,
          deleted: deleted.length,
          totalChanges,
          isClean: totalChanges === 0,
          title:
            totalChanges === 0
              ? "Working directory clean"
              : `${totalChanges} change${totalChanges > 1 ? "s" : ""} detected`,
        },
        output: output.trim(),
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      return {
        metadata: {
          branch: "unknown",
          trackingBranch: "",
          isClean: false,
          error: true,
          message: errorMessage,
          title: "Git status failed",
        },
        output: `Failed to get git status: ${errorMessage}`,
      }
    }
  },
})
