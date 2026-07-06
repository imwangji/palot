import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { app } from "electron"

const OPENCODE_BIN_NAME = process.platform === "win32" ? "opencode.exe" : "opencode"
const OPENCODE_CMD_NAME = process.platform === "win32" ? "opencode.cmd" : "opencode"

export interface OpenCodeCommand {
	command: string
	shell: boolean
}

export function getOpenCodeBinDirs(): string[] {
	const dirs = [
		path.join(process.resourcesPath, "opencode"),
		path.join(app.getAppPath(), "node_modules", "opencode-ai", "bin"),
		path.join(app.getAppPath(), "..", "..", "node_modules", "opencode-ai", "bin"),
		path.join(process.cwd(), "node_modules", "opencode-ai", "bin"),
		path.join(process.cwd(), "..", "..", "node_modules", "opencode-ai", "bin"),
		path.join(homedir(), ".opencode", "bin"),
	]

	if (process.platform === "win32" && process.env.APPDATA) {
		dirs.push(path.join(process.env.APPDATA, "npm"))
	}

	return Array.from(new Set(dirs))
}

export function resolveOpenCodeCommand(): OpenCodeCommand {
	for (const dir of getOpenCodeBinDirs()) {
		const binaryPath = path.join(dir, OPENCODE_BIN_NAME)
		if (existsSync(binaryPath)) {
			return { command: binaryPath, shell: false }
		}

		const commandPath = path.join(dir, OPENCODE_CMD_NAME)
		if (existsSync(commandPath)) {
			return {
				command: commandPath,
				shell: process.platform === "win32" && commandPath.endsWith(".cmd"),
			}
		}
	}

	return {
		command: OPENCODE_CMD_NAME,
		shell: process.platform === "win32",
	}
}

export function getAugmentedOpenCodePath(): string {
	const sep = process.platform === "win32" ? ";" : ":"
	return `${getOpenCodeBinDirs().join(sep)}${sep}${process.env.PATH ?? ""}`
}

export function getOpenCodeEnv(
	overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
	const userData = app.getPath("userData")
	return {
		...process.env,
		PATH: getAugmentedOpenCodePath(),
		XDG_CONFIG_HOME: path.join(userData, "opencode-config"),
		XDG_DATA_HOME: path.join(userData, "opencode-data"),
		XDG_STATE_HOME: path.join(userData, "opencode-state"),
		...overrides,
	}
}
