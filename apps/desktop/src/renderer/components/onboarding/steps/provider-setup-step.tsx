/**
 * Onboarding: account setup.
 *
 * Users sign in with the hosted sub2api account. The app then configures the
 * bundled Agent runtime with a device-specific API key automatically.
 */

import { Button } from "@palot/ui/components/button"
import { Spinner } from "@palot/ui/components/spinner"
import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2Icon, LogInIcon, SparklesIcon } from "lucide-react"
import { motion } from "motion/react"
import { useCallback, useMemo, useState } from "react"
import {
	queryKeys,
	useAllProviders,
	useConnectedProviders,
} from "../../../hooks/use-opencode-data"
import { useServerConnection } from "../../../hooks/use-server"
import { Sub2ApiAuthDialog } from "../../settings/sub2api-auth-dialog"

interface ProviderSetupStepProps {
	onComplete: (count: number) => void
	onSkip: () => void
}

const SUB2API_PROVIDER_ID = "openai"

export function ProviderSetupStep({ onComplete, onSkip }: ProviderSetupStepProps) {
	const { connected: serverConnected } = useServerConnection()
	const { data: allProviders, loading: catalogLoading, reload: reloadCatalog } = useAllProviders()
	const { loading: connectedLoading, reload: reloadConnected } = useConnectedProviders()
	const queryClient = useQueryClient()
	const [authDialogOpen, setAuthDialogOpen] = useState(false)

	const loading = catalogLoading || connectedLoading
	const connectedIds = useMemo(
		() => new Set(allProviders?.connected ?? []),
		[allProviders?.connected],
	)
	const accountConnected = connectedIds.has(SUB2API_PROVIDER_ID)

	const reload = useCallback(() => {
		reloadCatalog()
		reloadConnected()
		queryClient.invalidateQueries({ queryKey: queryKeys.allProviders })
		queryClient.invalidateQueries({ queryKey: queryKeys.connectedProviders })
		queryClient.invalidateQueries({
			predicate: (q) => q.queryKey[0] === "providers",
		})
	}, [reloadCatalog, reloadConnected, queryClient])

	const handleConnected = useCallback(() => {
		setAuthDialogOpen(false)
		reload()
		onComplete(Math.max(connectedIds.size, 1))
	}, [connectedIds.size, onComplete, reload])

	if (!serverConnected) {
		return (
			<div className="flex h-full flex-col items-center justify-center space-y-6 text-center">
				<div className="flex flex-col items-center space-y-2">
					<Spinner className="size-8 text-muted-foreground" />
					<h2 className="text-xl font-semibold">正在启动本地 Agent 服务...</h2>
					<p className="max-w-md text-sm text-muted-foreground">
						客户端正在连接内置后台进程，通常只需要几秒钟。
					</p>
				</div>
				<Button variant="outline" onClick={onSkip}>
					稍后再说
				</Button>
			</div>
		)
	}

	return (
		<div className="flex h-full flex-col items-center justify-center space-y-8 px-6 text-center">
			<div className="max-w-md space-y-3">
				<motion.div
					initial={{ scale: 0.9, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
				>
					<SparklesIcon className="size-6" />
				</motion.div>
				<h2 className="text-2xl font-bold tracking-tight">登录旺记账号</h2>
				<p className="text-muted-foreground">
					登录或注册后，客户端会自动连接 sub2api.bywangji.com，并为本设备配置专用模型网关 Key。
				</p>
			</div>

			<div className="flex w-full max-w-md flex-col items-center gap-4">
				<div className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
						{accountConnected ? (
							<CheckCircle2Icon className="size-5" />
						) : (
							<LogInIcon className="size-5" />
						)}
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">
							{accountConnected ? "账号已连接" : "尚未登录账号"}
						</p>
						<p className="text-xs text-muted-foreground">
							{accountConnected
								? "模型调用会通过你的 sub2api 账号计费和统计。"
								: "不需要手动填写 OpenAI API Key，登录后自动完成配置。"}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap justify-center gap-3">
					<Button
						size="lg"
						className="min-w-40 gap-2"
						onClick={() =>
							accountConnected ? onComplete(connectedIds.size) : setAuthDialogOpen(true)
						}
						disabled={loading}
					>
						{loading && <Spinner className="size-4" />}
						{accountConnected ? "进入工作台" : "登录 / 注册"}
					</Button>
					<Button variant="outline" size="lg" onClick={onSkip}>
						稍后再说
					</Button>
				</div>

				{!accountConnected && (
					<p className="text-xs text-muted-foreground">
						未登录时无法正常发起 Agent 对话；充值、套餐和用量统计都在官网账号中管理。
					</p>
				)}
			</div>

			<Sub2ApiAuthDialog
				open={authDialogOpen}
				onOpenChange={setAuthDialogOpen}
				onConnected={handleConnected}
			/>
		</div>
	)
}
