/**
 * Onboarding handlers for the Palot desktop app.
 *
 * Provides IPC-callable functions for the first-run experience:
 * - OpenCode CLI detection and version compatibility check
 * - OpenCode CLI installation (via curl/shell)
 * - Multi-provider config detection and migration via @palot/configconv
 *   Supported providers: Claude Code, Cursor, OpenCode
 */

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { OpenCodeCheckResult } from "./compatibility"
import { checkOpenCode } from "./compatibility"
import { createLogger } from "./logger"

const log = createLogger("onboarding")

// ============================================================
// Types
// ============================================================

/** Supported migration source providers. */
export type MigrationProvider = "claude-code" | "cursor" | "opencode"

/** Quick-detect result for a single provider (no heavy imports). */
export interface ProviderDetection {
	provider: MigrationProvider
	found: boolean
	/** Human-readable label */
	label: string
	/** Short summary of what was found */
	summary: string
	/** Number of MCP servers found */
	mcpServerCount: number
	/** Number of agents found */
	agentCount: number
	/** Number of commands found */
	commandCount: number
	/** Number of rule files found (e.g. .mdc rules, CLAUDE.md, AGENTS.md) */
	ruleCount: number
	/** Number of skills found */
	skillCount: number
	/** Number of projects found */
	projectCount: number
	/** Whether global settings exist */
	hasGlobalSettings: boolean
	/** Whether permissions exist (cli-config.json, settings.json, etc.) */
	hasPermissions: boolean
	/** Claude Code specific: hooks present */
	hasHooks: boolean
	/** Claude Code specific: total sessions for history import */
	totalSessions: number
	/** Claude Code specific: total messages for history import */
	totalMessages: number
}

export interface MigrationPreview {
	categories: MigrationCategoryPreview[]
	warnings: string[]
	manualActions: string[]
	errors: string[]
	fileCount: number
	/** Number of sessions that will be imported (0 if history not selected) */
	sessionCount: number
	/** Number of projects the sessions span */
	sessionProjectCount: number
}

export interface MigrationCategoryPreview {
	category: string
	itemCount: number
	files: MigrationFilePreview[]
}

export interface MigrationFilePreview {
	path: string
	status: "new" | "modified" | "skipped"
	lineCount: number
	content?: string
}

export interface MigrationResult {
	success: boolean
	filesWritten: string[]
	filesSkipped: string[]
	backupDir: string | null
	warnings: string[]
	manualActions: string[]
	errors: string[]
	/** Number of history sessions that were skipped as duplicates */
	historyDuplicatesSkipped: number
}

// ============================================================
// Provider metadata
// ============================================================

const PROVIDER_LABELS: Record<MigrationProvider, string> = {
	"claude-code": "Claude Code",
	cursor: "Cursor",
	opencode: "OpenCode",
}

// ============================================================
// OpenCode check (delegates to compatibility module)
// ============================================================

export async function checkOpenCodeInstallation(): Promise<OpenCodeCheckResult> {
	return checkOpenCode()
}

// ============================================================
// OpenCode install
// ============================================================

let installProcess = false

/**
 * Installs OpenCode CLI by running the official install script.
 * Streams output lines to the renderer via the "onboarding:install-output" channel.
 * Returns when the install process exits.
 */
export async function installOpenCode(): Promise<{ success: boolean; error?: string }> {
	if (installProcess) {
		return { success: false, error: "安装已在进行中" }
	}

	installProcess = true
	log.warn("OpenCode install requested, but this build expects a bundled OpenCode runtime")
	installProcess = false
	return {
		success: false,
		error: "当前版本已内置 OpenCode，无需单独安装。请重新安装最新版客户端。",
	}
}

// ============================================================
// Multi-provider detection (lightweight, no configconv import)
// ============================================================

/**
 * Quickly detects which agent tools have configuration on this machine.
 * Does NOT import @palot/configconv, just checks for file/directory existence.
 * Returns an array of detections (one per supported provider).
 */
export async function detectProviders(): Promise<ProviderDetection[]> {
	const results = await Promise.all([detectClaudeCode(), detectCursor(), detectOpenCodeProvider()])
	return results
}

/**
 * Quickly detects whether Claude Code configuration exists on this machine.
 */
async function detectClaudeCode(): Promise<ProviderDetection> {
	const home = homedir()
	const claudeSettingsDir = path.join(home, ".Claude")

	const hasGlobalSettings = existsSync(path.join(claudeSettingsDir, "settings.json"))
	const hasUserState = existsSync(path.join(home, ".claude.json"))

	// Check for projects directory to estimate project count
	const projectsDir = path.join(claudeSettingsDir, "projects")
	let projectCount = 0
	try {
		const { readdirSync } = await import("node:fs")
		const entries = readdirSync(projectsDir, { withFileTypes: true })
		projectCount = entries.filter((e) => e.isDirectory()).length
	} catch {
		// Directory doesn't exist
	}

	let ruleCount = 0
	if (existsSync(path.join(home, ".claude", "CLAUDE.md"))) ruleCount++
	if (existsSync("CLAUDE.md")) ruleCount++

	const found = hasGlobalSettings || hasUserState || projectCount > 0

	const summaryParts: string[] = []
	if (hasGlobalSettings) summaryParts.push("global settings")
	if (projectCount > 0) summaryParts.push(`${projectCount} project${projectCount === 1 ? "" : "s"}`)
	if (ruleCount > 0) summaryParts.push("rules")

	return {
		provider: "claude-code",
		found,
		label: PROVIDER_LABELS["claude-code"],
		summary: found ? `Found ${summaryParts.join(", ")}` : "No Claude Code configuration detected",
		hasGlobalSettings: hasGlobalSettings || hasUserState,
		hasPermissions: hasGlobalSettings,
		projectCount,
		mcpServerCount: 0,
		agentCount: 0,
		commandCount: 0,
		ruleCount,
		hasHooks: false,
		skillCount: 0,
		totalSessions: 0,
		totalMessages: 0,
	}
}

/**
 * Quickly detects whether Cursor configuration exists on this machine.
 * Reads mcp.json to count servers and checks for rules directories.
 */
async function detectCursor(): Promise<ProviderDetection> {
	const { readFileSync, readdirSync } = await import("node:fs")
	const home = homedir()
	const cursorDir = path.join(home, ".cursor")

	// MCP servers: parse mcp.json to count actual server entries
	let mcpServerCount = 0
	const mcpJsonPath = path.join(cursorDir, "mcp.json")
	if (existsSync(mcpJsonPath)) {
		try {
			const raw = readFileSync(mcpJsonPath, "utf-8")
			const parsed = JSON.parse(raw)
			if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
				mcpServerCount = Object.keys(parsed.mcpServers).length
			}
		} catch {
			// malformed JSON, count as 0
		}
	}

	// Permissions from cli-config.json
	const hasCliConfig = existsSync(path.join(cursorDir, "cli-config.json"))

	// Skills
	let skillCount = 0
	const skillsDir = path.join(cursorDir, "skills")
	if (existsSync(skillsDir)) {
		try {
			skillCount = readdirSync(skillsDir, { withFileTypes: true }).filter(
				(e) => e.isDirectory() && e.name !== "skills-cursor",
			).length
		} catch {
			// ignore
		}
	}

	// Agents (global)
	let agentCount = 0
	const agentsDir = path.join(cursorDir, "agents")
	if (existsSync(agentsDir)) {
		try {
			agentCount = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).length
		} catch {
			// ignore
		}
	}

	// Commands (global)
	let commandCount = 0
	const commandsDir = path.join(cursorDir, "commands")
	if (existsSync(commandsDir)) {
		try {
			commandCount = readdirSync(commandsDir).filter((f) => f.endsWith(".md")).length
		} catch {
			// ignore
		}
	}

	// Rules: Cursor stores rules per-project in .cursor/rules/*.mdc|*.md.
	// The lightweight detector cannot scan all projects, but it checks
	// if the global cursor dir has any rule-like content.
	// (Full scan via scanProvider will get project-level rule counts.)
	const ruleCount = 0

	const found =
		mcpServerCount > 0 || hasCliConfig || skillCount > 0 || agentCount > 0 || commandCount > 0

	const summaryParts: string[] = []
	if (mcpServerCount > 0)
		summaryParts.push(`${mcpServerCount} MCP server${mcpServerCount === 1 ? "" : "s"}`)
	if (hasCliConfig) summaryParts.push("permissions")
	if (agentCount > 0) summaryParts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`)
	if (commandCount > 0) summaryParts.push(`${commandCount} command${commandCount === 1 ? "" : "s"}`)
	if (skillCount > 0) summaryParts.push(`${skillCount} skill${skillCount === 1 ? "" : "s"}`)

	return {
		provider: "cursor",
		found,
		label: PROVIDER_LABELS.cursor,
		summary: found ? `Found ${summaryParts.join(", ")}` : "No Cursor configuration detected",
		hasGlobalSettings: mcpServerCount > 0,
		hasPermissions: hasCliConfig,
		projectCount: 0,
		mcpServerCount,
		agentCount,
		commandCount,
		ruleCount,
		hasHooks: false,
		skillCount,
		totalSessions: 0,
		totalMessages: 0,
	}
}

/**
 * Quickly detects whether OpenCode configuration exists on this machine.
 * Parses opencode.json to count MCP servers.
 */
async function detectOpenCodeProvider(): Promise<ProviderDetection> {
	const { readFileSync, readdirSync } = await import("node:fs")
	const home = homedir()
	const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
	const ocDir = path.join(xdgConfig, "opencode")

	// Parse opencode.json to count MCP servers
	let mcpServerCount = 0
	let hasConfig = false
	let hasPermissions = false
	const configPath = path.join(ocDir, "opencode.json")
	if (existsSync(configPath)) {
		hasConfig = true
		try {
			const raw = readFileSync(configPath, "utf-8")
			const parsed = JSON.parse(raw)
			if (parsed?.mcp && typeof parsed.mcp === "object") {
				mcpServerCount = Object.keys(parsed.mcp).length
			}
			if (parsed?.permission && typeof parsed.permission === "object") {
				hasPermissions = Object.keys(parsed.permission).length > 0
			}
		} catch {
			// malformed JSON
		}
	}

	const hasAgentsMd = existsSync(path.join(ocDir, "AGENTS.md"))

	let agentCount = 0
	const agentsDir = path.join(ocDir, "agents")
	if (existsSync(agentsDir)) {
		try {
			agentCount = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).length
		} catch {
			// ignore
		}
	}

	let commandCount = 0
	const commandsDir = path.join(ocDir, "commands")
	if (existsSync(commandsDir)) {
		try {
			commandCount = readdirSync(commandsDir).filter((f) => f.endsWith(".md")).length
		} catch {
			// ignore
		}
	}

	let skillCount = 0
	const skillsDir = path.join(ocDir, "skills")
	if (existsSync(skillsDir)) {
		try {
			skillCount = readdirSync(skillsDir, { withFileTypes: true }).filter((e) =>
				e.isDirectory(),
			).length
		} catch {
			// ignore
		}
	}

	const ruleCount = hasAgentsMd ? 1 : 0
	const found = hasConfig || hasAgentsMd || agentCount > 0 || commandCount > 0

	const summaryParts: string[] = []
	if (hasConfig) summaryParts.push("global config")
	if (mcpServerCount > 0)
		summaryParts.push(`${mcpServerCount} MCP server${mcpServerCount === 1 ? "" : "s"}`)
	if (hasAgentsMd) summaryParts.push("rules")
	if (agentCount > 0) summaryParts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`)
	if (commandCount > 0) summaryParts.push(`${commandCount} command${commandCount === 1 ? "" : "s"}`)
	if (skillCount > 0) summaryParts.push(`${skillCount} skill${skillCount === 1 ? "" : "s"}`)

	return {
		provider: "opencode",
		found,
		label: PROVIDER_LABELS.opencode,
		summary: found ? `Found ${summaryParts.join(", ")}` : "No OpenCode configuration detected",
		hasGlobalSettings: hasConfig,
		hasPermissions,
		projectCount: 0,
		mcpServerCount,
		agentCount,
		commandCount,
		ruleCount,
		hasHooks: false,
		skillCount,
		totalSessions: 0,
		totalMessages: 0,
	}
}

// ============================================================
// Migration (lazy-loads @palot/configconv)
// ============================================================

/**
 * Runs a full scan for the specified provider and returns detailed detection results.
 * Lazy-loads @palot/configconv to keep the main process fast when not needed.
 */
export async function scanProvider(provider: MigrationProvider): Promise<{
	detection: ProviderDetection
	scanResult: unknown
}> {
	const { scanFormat } = await import("@palot/configconv")

	const scanResult = await scanFormat({
		format: provider,
		global: true,
		includeHistory: provider === "claude-code" || provider === "cursor",
	})

	const detection = buildDetectionFromScan(provider, scanResult)
	return { detection, scanResult }
}

/**
 * Runs a dry-run migration preview. Returns what would be changed without writing anything.
 */
export async function previewMigration(
	_provider: MigrationProvider,
	_scanResult: unknown,
	_categories: string[],
): Promise<MigrationPreview> {
	void _scanResult
	void _categories
	return {
		categories: [],
		warnings: ["Codey does not import or migrate external agent configurations."],
		manualActions: [],
		errors: [],
		fileCount: 0,
		sessionCount: 0,
		sessionProjectCount: 0,
	}
}
/**
 * Executes the migration, writing files to disk with a backup.
 * Sends progress events to the renderer via IPC during history migration.
 */
export async function executeMigration(
	_provider: MigrationProvider,
	_scanResult: unknown,
	_categories: string[],
): Promise<MigrationResult> {
	void _scanResult
	void _categories
	return {
		success: false,
		filesWritten: [],
		filesSkipped: [],
		backupDir: null,
		warnings: ["Codey keeps user agent configurations isolated and does not perform migrations."],
		manualActions: [],
		errors: [],
		historyDuplicatesSkipped: 0,
	}
}
/**
 * Restores a migration backup.
 */
export async function restoreMigrationBackup(): Promise<{
	success: boolean
	restored: string[]
	removed: string[]
	errors: string[]
}> {
	const { restore } = await import("@palot/configconv")
	const result = await restore()
	return {
		success: result.errors.length === 0,
		restored: result.restored,
		removed: result.removed,
		errors: result.errors.map((e) => `${e.path}: ${e.error}`),
	}
}

// ============================================================
// Helpers
// ============================================================

/**
 * Build a ProviderDetection from a configconv scan result.
 * This is the "full scan" counterpart to the lightweight detectXxx() functions above.
 */
function buildDetectionFromScan(
	provider: MigrationProvider,
	// biome-ignore lint/suspicious/noExplicitAny: scan result is dynamically typed from import
	scanResult: any,
): ProviderDetection {
	const data = scanResult.data

	switch (provider) {
		case "claude-code":
			return buildClaudeCodeDetection(data)
		case "cursor":
			return buildCursorDetection(data)
		case "opencode":
			return buildOpenCodeDetection(data)
	}
}

// biome-ignore lint/suspicious/noExplicitAny: scan result is dynamically typed
function buildClaudeCodeDetection(data: any): ProviderDetection {
	const mcpServerCount = countClaudeCodeMcpServers(data)
	const agentCount = countClaudeCodeItems(data, "agents")
	const commandCount = countClaudeCodeItems(data, "commands")
	let ruleCount = 0
	if (data.global?.claudeMd) ruleCount++
	for (const p of data.projects) {
		if (p.claudeMd) ruleCount++
	}
	const hasHooks = !!(data.global.settings as Record<string, unknown> | undefined)?.hooks
	const skillCount =
		data.global.skills.length +
		data.projects.reduce((sum: number, p: { skills: unknown[] }) => sum + p.skills.length, 0)

	const summaryParts: string[] = []
	if (data.global.settings) summaryParts.push("global settings")
	if (data.projects.length > 0)
		summaryParts.push(`${data.projects.length} project${data.projects.length === 1 ? "" : "s"}`)
	if (mcpServerCount > 0)
		summaryParts.push(`${mcpServerCount} MCP server${mcpServerCount === 1 ? "" : "s"}`)
	if (agentCount > 0) summaryParts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`)

	return {
		provider: "claude-code",
		found: true,
		label: PROVIDER_LABELS["claude-code"],
		summary: `Found ${summaryParts.join(", ")}`,
		hasGlobalSettings: !!data.global.settings || !!data.global.userState,
		hasPermissions: !!data.global.settings,
		projectCount: data.projects.length,
		mcpServerCount,
		agentCount,
		commandCount,
		ruleCount,
		hasHooks,
		skillCount,
		totalSessions: data.history?.totalSessions ?? 0,
		totalMessages: data.history?.totalMessages ?? 0,
	}
}

// biome-ignore lint/suspicious/noExplicitAny: scan result is dynamically typed
function buildCursorDetection(data: any): ProviderDetection {
	const mcpServerCount = data.global.mcpJson?.mcpServers
		? Object.keys(data.global.mcpJson.mcpServers).length
		: 0
	const agentCount = data.global.agents?.length ?? 0
	const commandCount = data.global.commands?.length ?? 0
	const skillCount = data.global.skills?.length ?? 0
	const hasPermissions = !!data.global.cliConfig

	let ruleCount = 0
	for (const p of data.projects ?? []) {
		ruleCount += p.rules?.length ?? 0
		if (p.cursorRules) ruleCount++
	}

	const totalSessions = data.history?.totalSessions ?? 0
	const totalMessages = data.history?.totalMessages ?? 0

	const summaryParts: string[] = []
	if (mcpServerCount > 0)
		summaryParts.push(`${mcpServerCount} MCP server${mcpServerCount === 1 ? "" : "s"}`)
	if (hasPermissions) summaryParts.push("permissions")
	if (agentCount > 0) summaryParts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`)
	if (commandCount > 0) summaryParts.push(`${commandCount} command${commandCount === 1 ? "" : "s"}`)
	if (skillCount > 0) summaryParts.push(`${skillCount} skill${skillCount === 1 ? "" : "s"}`)
	if (totalSessions > 0)
		summaryParts.push(`${totalSessions} chat session${totalSessions === 1 ? "" : "s"}`)

	return {
		provider: "cursor",
		found: true,
		label: PROVIDER_LABELS.cursor,
		summary: `Found ${summaryParts.join(", ") || "configuration"}`,
		hasGlobalSettings: !!data.global.mcpJson || hasPermissions,
		hasPermissions,
		projectCount: data.projects?.length ?? 0,
		mcpServerCount,
		agentCount,
		commandCount,
		ruleCount,
		hasHooks: false,
		skillCount,
		totalSessions,
		totalMessages,
	}
}

// biome-ignore lint/suspicious/noExplicitAny: scan result is dynamically typed
function buildOpenCodeDetection(data: any): ProviderDetection {
	let mcpServerCount = 0
	if (data.global.config?.mcp) {
		mcpServerCount += Object.keys(data.global.config.mcp).length
	}
	const agentCount = data.global.agents?.length ?? 0
	const commandCount = data.global.commands?.length ?? 0
	const skillCount = data.global.skills?.length ?? 0
	const ruleCount = data.global.agentsMd ? 1 : 0
	const hasPermissions =
		!!data.global.config?.permission && Object.keys(data.global.config.permission).length > 0

	const summaryParts: string[] = []
	if (data.global.config) summaryParts.push("global config")
	if (mcpServerCount > 0)
		summaryParts.push(`${mcpServerCount} MCP server${mcpServerCount === 1 ? "" : "s"}`)
	if (ruleCount > 0) summaryParts.push("rules")
	if (agentCount > 0) summaryParts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`)

	return {
		provider: "opencode",
		found: true,
		label: PROVIDER_LABELS.opencode,
		summary: `Found ${summaryParts.join(", ") || "configuration"}`,
		hasGlobalSettings: !!data.global.config,
		hasPermissions,
		projectCount: data.projects?.length ?? 0,
		mcpServerCount,
		agentCount,
		commandCount,
		ruleCount,
		hasHooks: false,
		skillCount,
		totalSessions: 0,
		totalMessages: 0,
	}
}

// biome-ignore lint/suspicious/noExplicitAny: scan result is dynamically imported
function countClaudeCodeMcpServers(data: any): number {
	let count = 0
	// Global MCP from user state
	if (data.global.userState?.projects) {
		for (const project of Object.values(data.global.userState.projects) as Array<
			Record<string, unknown>
		>) {
			if (project.mcpServers && typeof project.mcpServers === "object") {
				count += Object.keys(project.mcpServers).length
			}
		}
	}
	// Per-project MCP
	for (const project of data.projects) {
		if (project.mcpJson?.mcpServers) {
			count += Object.keys(project.mcpJson.mcpServers).length
		}
	}
	return count
}

// biome-ignore lint/suspicious/noExplicitAny: scan result is dynamically imported
function countClaudeCodeItems(data: any, field: string): number {
	let count = 0
	for (const project of data.projects) {
		count += project[field]?.length ?? 0
	}
	return count
}
