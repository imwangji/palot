import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@palot/ui/components/sidebar"
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import {
	ArrowLeftIcon,
	BellIcon,
	GitForkIcon,
	InfoIcon,
	PlugIcon,
	ServerIcon,
	SettingsIcon,
	WrenchIcon,
} from "lucide-react"
import { useEffect } from "react"
import { useSetSidebarSlot } from "../sidebar-slot-context"

// ============================================================
// Tab definitions
// ============================================================

type SettingsTab =
	| "general"
	| "servers"
	| "notifications"
	| "providers"
	| "worktrees"
	| "setup"
	| "about"

const tabs: { id: SettingsTab; label: string; icon: typeof SettingsIcon }[] = [
	{ id: "general", label: "通用", icon: SettingsIcon },
	{ id: "servers", label: "服务器", icon: ServerIcon },
	{ id: "notifications", label: "通知", icon: BellIcon },
	{ id: "providers", label: "模型供应商", icon: PlugIcon },
	{ id: "worktrees", label: "隔离工作区", icon: GitForkIcon },
	{ id: "setup", label: "初始化", icon: WrenchIcon },
	{ id: "about", label: "关于", icon: InfoIcon },
]

// ============================================================
// Settings layout (renders <Outlet /> for child routes)
// ============================================================

export function SettingsPage() {
	const { setContent, setFooter } = useSetSidebarSlot()

	useEffect(() => {
		setContent(<SettingsSidebarContent />)
		setFooter(false)
		return () => {
			setContent(null)
			setFooter(null)
		}
	}, [setContent, setFooter])

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto max-w-2xl px-8 py-6">
				<Outlet />
			</div>
		</div>
	)
}

// ============================================================
// Sidebar content injected via slot context
// ============================================================

function SettingsSidebarContent() {
	const navigate = useNavigate()
	const pathname = useRouterState({ select: (s) => s.location.pathname })

	// Derive active tab from the last path segment (e.g. "/settings/general" -> "general")
	const activeTab = pathname.split("/").pop() || "general"

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarGroupContent>
					<div className="px-2 py-1">
						<button
							type="button"
							onClick={() => navigate({ to: "/" })}
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-4" />
							返回应用
						</button>
					</div>
					<SidebarMenu>
						{tabs.map((tab) => {
							const Icon = tab.icon
							return (
								<SidebarMenuItem key={tab.id}>
									<SidebarMenuButton
										isActive={activeTab === tab.id}
										onClick={() => navigate({ to: `/settings/${tab.id}` })}
										tooltip={tab.label}
									>
										<Icon aria-hidden="true" className="size-4" />
										<span>{tab.label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							)
						})}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		</SidebarContent>
	)
}
