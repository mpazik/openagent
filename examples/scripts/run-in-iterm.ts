import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { dirname, resolve } from "path";

const execAsync = promisify(exec);

async function main() {
  const firstArg = process.argv[2];
  if (!firstArg) {
    console.error("Error: Command or script path is required");
    process.exit(1);
  }

  // Check if the first argument is a file path
  if (existsSync(firstArg)) {
    const scriptPath = firstArg;
    const scriptArgs = process.argv.slice(3).join(" ");

    // Ensure the script is executable
    await execAsync(`chmod +x '${scriptPath}'`);

    const command = scriptArgs ? `${scriptPath} ${scriptArgs}` : scriptPath;
    await runInITerm(dirname(resolve(scriptPath)), command);
  } else {
    const command = process.argv.slice(2).join(" ");
    await runInITerm(process.cwd(), command);
  }
}

async function runInITerm(dir: string, command: string) {
  const encodedCommand = Buffer.from(command).toString("base64");
  const encodedDir = Buffer.from(dir).toString("base64");

  console.log(`Command ${command}`);

  const appleScript = `
    tell application "iTerm2"
      tell current window
        create tab with default profile
        tell current session
          set decodedDir to do shell script "echo '${encodedDir}' | base64 -d"
          write text "cd \\"" & decodedDir & "\\""
          set decodedCommand to do shell script "echo '${encodedCommand}' | base64 -d"
          write text decodedCommand
        end tell
      end tell
    end tell
  `;

  try {
    await execAsync(`osascript -e '${appleScript}'`);
  } catch (error) {
    console.error("Failed to run command in iTerm:", error);
    process.exit(1);
  }
}

main().catch(console.error);
