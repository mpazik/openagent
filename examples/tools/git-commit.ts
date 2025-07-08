import { z } from "zod";
import { Tool } from "openagent-ai";

export const gitCommit = Tool.define({
  id: "commit",
  description: `Commits current changes to the git repository with conventional commit format. It automatically stages all changes before committing.
- Validates git repository status and presence
- Stages all changes automatically
- Supports conventional commit format with optional prefix and scope
- Returns detailed metadata about the commit

Use this tool when you need to save your current work progress to version control`,
  parameters: z.object({
    message: z
      .string()
      .describe("The commit message describing what was changed"),
    commitPrefix: z
      .string()
      .optional()
      .describe(
        "Optional commit type prefix (feat, fix, chore, docs, etc.). Defaults to 'feat' when feature name is provided",
      ),
    featureName: z
      .string()
      .optional()
      .describe(
        "Optional feature name to scope the commit (e.g. 'auth', 'ui', 'api')",
      ),
  }),
  async execute(params, { metadata }) {
    const { message, commitPrefix, featureName } = params;

    try {
      // Check if we're in a git repository
      const gitCheck = Bun.spawn(["git", "rev-parse", "--git-dir"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const gitCheckExit = await gitCheck.exited;
      if (gitCheckExit !== 0) {
        throw new Error("Not in a git repository");
      }

      // Check for changes
      const statusProc = Bun.spawn(["git", "status", "--porcelain"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const statusOutput = await new Response(statusProc.stdout).text();
      const statusExit = await statusProc.exited;

      if (statusExit !== 0) {
        throw new Error("Failed to check git status");
      }

      if (!statusOutput.trim()) {
        metadata({
          committed: false,
          hasChanges: false,
          title: "No changes to commit",
        });
        return {
          metadata: {
            committed: false,
            hasChanges: false,
            title: "No changes to commit",
          },
          output: "No changes detected in the repository",
        };
      }

      // Stage all changes
      const addProc = Bun.spawn(["git", "add", "."], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const addExit = await addProc.exited;
      if (addExit !== 0) {
        const addError = await new Response(addProc.stderr).text();
        throw new Error(`Failed to stage changes: ${addError}`);
      }

      // Build commit message
      let finalMessage = message;

      if (featureName) {
        const prefix = commitPrefix || "feat";
        finalMessage = `${prefix}(${featureName}): ${message}`;
      } else if (commitPrefix) {
        finalMessage = `${commitPrefix}: ${message}`;
      }

      // Commit changes
      const commitProc = Bun.spawn(["git", "commit", "-m", finalMessage], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const commitOutput = await new Response(commitProc.stdout).text();
      const commitError = await new Response(commitProc.stderr).text();
      const commitExit = await commitProc.exited;

      if (commitExit !== 0) {
        throw new Error(`Failed to commit: ${commitError}`);
      }

      // Extract commit hash from output
      const hashMatch = commitOutput.match(/\[[\w-]+\s+([a-f0-9]+)]/);
      const commitHash = hashMatch ? hashMatch[1] : "unknown";

      // Get file change statistics
      const changedFiles = statusOutput.trim().split("\n").length;

      const resultMetadata = {
        committed: true,
        hasChanges: true,
        commitHash,
        changedFiles,
        commitMessage: finalMessage,
        title: `Committed: ${finalMessage}`,
      };

      metadata(resultMetadata);

      return {
        metadata: resultMetadata,
        output: `Successfully committed changes with message: "${finalMessage}"\nCommit hash: ${commitHash}\nFiles changed: ${changedFiles}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const errorMetadata = {
        committed: false,
        hasChanges: false,
        error: errorMessage,
        title: "Commit failed",
      };

      return {
        metadata: errorMetadata,
        output: `Failed to commit changes: ${errorMessage}`,
      };
    }
  },
});
