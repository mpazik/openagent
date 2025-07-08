import type { Agent } from "openagent-ai";
import { saveConfirmPrompt } from "./save.ts";

export const BUILD_IN_TOOLS = {
  bash: "bash",
  edit: "edit",
  webFetch: "webFetch",
  glob: "glob",
  grep: "grep",
  list: "list",
  lsp_diagnostic: "lsp_diagnostic",
  lsp_hover: "lsp_hover",
  patch: "patch",
  read: "read",
  write: "write",
  todowrite: "todowrite",
  todoread: "todoread",
} as const;

export const BUILD_IN_READ_TOOLS = [
  BUILD_IN_TOOLS.grep,
  BUILD_IN_TOOLS.glob,
  BUILD_IN_TOOLS.read,
  BUILD_IN_TOOLS.list,
];

export const envPrompt = ({
  appInfo,
}: Agent.Services): string => `Here is some useful information about the environment you are running in:
<env>
  Working directory: ${appInfo.path.cwd}
  Is directory a git repo: ${appInfo.git ? "yes" : "no"}
  Platform: ${process.platform}
  Today's date: ${new Date().toDateString()}
</env>`;

export const preloadedFilePrompt = async (
  services: Agent.Services,
  filePath: string | undefined,
  outputArtifactName: string,
): Promise<string | undefined> => {
  if (!filePath) return undefined;
  let fileContent: string | undefined;
  if (filePath) {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      await services.markFileAsRead(filePath);
      fileContent = await file.text();
    }
  }
  return fileContent
    ? `You are going to update a ${outputArtifactName} based on the provided file content. ${saveConfirmPrompt()}
<path>${filePath}</path>
<content>
${fileContent}
</content>`
    : `You are going to create a ${outputArtifactName} based on the user's request. ${saveConfirmPrompt()} located at <path>${filePath}</path>`;
};

export const selectPrompt = (
  selection: string | undefined,
): string | undefined => {
  if (!selection) return "";
  return `Please focus inparticular on this part that was sellected by the user.
<selection>${selection}</selection>.
`;
};
