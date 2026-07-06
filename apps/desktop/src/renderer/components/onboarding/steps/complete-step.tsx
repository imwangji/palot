/**
 * Onboarding: Complete / Ready.
 *
 * Codey deliberately does not offer config migration from Claude Code, Cursor,
 * Codex, or a user's existing OpenCode setup. The bundled Agent runtime is
 * configured in Codey's private app data directory only.
 */

import { Button } from "@palot/ui/components/button"
import { CheckCircle2Icon, CommandIcon } from "lucide-react"
import { motion } from "motion/react"
import type { MigrationProvider, MigrationResult } from "../../../../preload/api"

interface CompleteStepProps {
	opencodeVersion: string | null
	migratedProviders: string[]
	migrationResult: MigrationResult | null
	onStartMigration: (provider: MigrationProvider) => void
	onFinish: () => void
}

const isElectron = typeof window !== "undefined" && "palot" in window
const isMac = isElectron && window.palot.platform === "darwin"

export function CompleteStep({ opencodeVersion, onFinish }: CompleteStepProps) {
	const modKey = isMac ? "Cmd" : "Ctrl"

	return (
		<div className="flex h-full flex-col items-center justify-center px-6">
			<div className="w-full max-w-md space-y-8 text-center">
				<motion.div
					className="flex justify-center"
					initial={{ scale: 0, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{
						type: "spring",
						stiffness: 260,
						damping: 20,
						delay: 0.1,
					}}
				>
					<div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
						<CheckCircle2Icon className="size-8 text-emerald-500" />
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3, duration: 0.3 }}
					className="space-y-2"
				>
					<h2 className="text-2xl font-semibold text-foreground">Codey 已就绪</h2>
					<p className="text-sm text-muted-foreground">
						{opencodeVersion
							? `本地 Agent ${formatVersion(opencodeVersion)} 已连接，模型网关已由 Codey 管理。`
							: "Codey 已准备好开始工作。"}
					</p>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.55, duration: 0.3 }}
					className="space-y-2"
				>
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
						快捷键
					</p>
					<div className="flex justify-center">
						<div className="space-y-1.5 text-left text-sm text-muted-foreground">
							<ShortcutRow keys={[modKey, "K"]} label="命令面板" />
							<ShortcutRow keys={[modKey, "N"]} label="新建会话" />
							<ShortcutRow keys={[modKey, ","]} label="设置" />
						</div>
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.7, duration: 0.3 }}
					className="flex items-center justify-center gap-3"
				>
					<Button size="lg" onClick={onFinish}>
						开始使用
					</Button>
				</motion.div>
			</div>
		</div>
	)
}

function formatVersion(version: string): string {
	if (/^\d+\.\d+/.test(version)) return `v${version}`
	return `(${version})`
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
	return (
		<div className="flex items-center gap-3">
			<div className="flex items-center gap-0.5">
				{keys.map((key) => (
					<kbd
						key={key}
						className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground"
					>
						{key === "Cmd" ? <CommandIcon aria-hidden="true" className="size-2.5" /> : key}
					</kbd>
				))}
			</div>
			<span>{label}</span>
		</div>
	)
}
