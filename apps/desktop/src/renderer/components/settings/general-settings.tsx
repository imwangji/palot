import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@palot/ui/components/select"
import { Switch } from "@palot/ui/components/switch"
import { useAtomValue, useSetAtom } from "jotai"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { type DisplayMode, displayModeAtom, opaqueWindowsAtom } from "../../atoms/preferences"
import { useColorScheme, useSetColorScheme } from "../../hooks/use-theme"
import type { ColorScheme } from "../../lib/themes"
import { fetchOpenInTargets, setOpenInPreferred } from "../../services/backend"
import { SettingsRow } from "./settings-row"
import { SettingsSection } from "./settings-section"

const isElectron = typeof window !== "undefined" && "palot" in window

export function GeneralSettings() {
	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold">通用</h2>
			</div>

			<SettingsSection>
				<OpenDestinationRow />
			</SettingsSection>

			<SettingsSection title="外观">
				<ThemeRow />
				<OpaqueWindowsRow />
				<DisplayModeRow />
			</SettingsSection>
		</div>
	)
}

function OpenDestinationRow() {
	const [targets, setTargets] = useState<{ id: string; label: string; available: boolean }[]>([])
	const [preferred, setPreferred] = useState<string | null>(null)

	useEffect(() => {
		if (!isElectron) return
		fetchOpenInTargets().then((result) => {
			setTargets(result.targets.filter((t) => t.available))
			setPreferred(result.preferredTarget)
		})
	}, [])

	const handleChange = useCallback(async (value: string) => {
		setPreferred(value)
		await setOpenInPreferred(value)
	}, [])

	if (targets.length === 0) return null

	return (
		<SettingsRow
			label="默认打开位置"
			description="文件和文件夹默认用哪个应用打开"
		>
			<Select
				value={preferred ?? undefined}
				onValueChange={(v) => {
					if (v !== null) handleChange(v)
				}}
			>
				<SelectTrigger className="min-w-[180px]">
					<SelectValue placeholder="请选择..." />
				</SelectTrigger>
				<SelectContent>
					{targets.map((t) => (
						<SelectItem key={t.id} value={t.id}>
							{t.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</SettingsRow>
	)
}

function ThemeRow() {
	const colorScheme = useColorScheme()
	const setColorScheme = useSetColorScheme()

	const options: { value: ColorScheme; label: string; icon: typeof SunIcon }[] = [
		{ value: "light", label: "浅色", icon: SunIcon },
		{ value: "dark", label: "深色", icon: MoonIcon },
		{ value: "system", label: "跟随系统", icon: MonitorIcon },
	]

	return (
		<SettingsRow label="主题" description="选择浅色、深色，或跟随系统设置">
			<div className="flex items-center rounded-md border border-border">
				{options.map((opt) => {
					const Icon = opt.icon
					const isActive = colorScheme === opt.value
					return (
						<button
							key={opt.value}
							type="button"
							onClick={() => setColorScheme(opt.value)}
							className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors first:rounded-l-md last:rounded-r-md ${
								isActive
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Icon aria-hidden="true" className="size-3.5" />
							{opt.label}
						</button>
					)
				})}
			</div>
		</SettingsRow>
	)
}

function OpaqueWindowsRow() {
	const opaque = useAtomValue(opaqueWindowsAtom)
	const setOpaque = useSetAtom(opaqueWindowsAtom)

	const handleChange = useCallback(
		async (checked: boolean) => {
			setOpaque(checked)
			if (isElectron) {
				await window.palot.setOpaqueWindows(checked)
				// Requires relaunch -- prompt or auto-relaunch
				window.palot.relaunch()
			}
		},
		[setOpaque],
	)

	return (
		<SettingsRow
			label="使用不透明背景"
			description="窗口使用纯色背景，而不是系统半透明效果"
		>
			<Switch checked={opaque} onCheckedChange={handleChange} />
		</SettingsRow>
	)
}

function DisplayModeRow() {
	const displayMode = useAtomValue(displayModeAtom)
	const setDisplayMode = useSetAtom(displayModeAtom)

	return (
		<SettingsRow
			label="显示模式"
			description="调整会话中展示的信息详细程度"
		>
			<Select
				value={displayMode}
				onValueChange={(v) => setDisplayMode(v as DisplayMode)}
				items={{ default: "默认", verbose: "详细" }}
			>
				<SelectTrigger className="min-w-[140px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="default">默认</SelectItem>
					<SelectItem value="verbose">详细</SelectItem>
				</SelectContent>
			</Select>
		</SettingsRow>
	)
}
