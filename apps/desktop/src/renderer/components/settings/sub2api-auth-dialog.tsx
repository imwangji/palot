import { Button } from "@palot/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@palot/ui/components/dialog"
import { Input } from "@palot/ui/components/input"
import { Label } from "@palot/ui/components/label"
import { Spinner } from "@palot/ui/components/spinner"
import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { getBaseClient } from "../../services/connection-manager"

const SUB2API_BASE_URL = "https://sub2api.bywangji.com"
const SUB2API_OPENAI_BASE_URL = `${SUB2API_BASE_URL}/v1`
const CODEY_DEFAULT_GROUP_NAME = "codex-0.25"

type Mode = "login" | "register" | "two-factor"

interface Sub2ApiEnvelope<T> {
	code: number
	message: string
	reason?: string
	data?: T
}

interface Sub2ApiUser {
	id: number
	email: string
	username?: string
	balance?: number
}

interface AuthData {
	access_token?: string
	refresh_token?: string
	token_type?: string
	requires_2fa?: boolean
	temp_token?: string
	user_email_masked?: string
	user?: Sub2ApiUser
}

interface ApiKeyData {
	id: number
	key: string
	name: string
	group_id?: number | null
	status?: string
	group?: Sub2ApiGroup | null
}

interface PaginatedKeys {
	items?: ApiKeyData[]
}

interface Sub2ApiGroup {
	id: number
	name: string
	status?: string
}

interface Sub2ApiAuthDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConnected: () => void
}

function getDeviceId(): string {
	const key = "codey-desktop-device-id"
	const existing = localStorage.getItem(key)
	if (existing) return existing
	const legacy = localStorage.getItem("wangji-desktop-device-id")
	if (legacy) {
		localStorage.setItem(key, legacy)
		return legacy
	}
	const id = crypto.randomUUID()
	localStorage.setItem(key, id)
	return id
}

async function sub2apiRequest<T>(
	path: string,
	options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
	const headers: Record<string, string> = {
		Accept: "application/json",
		"Content-Type": "application/json",
	}
	if (options.token) headers.Authorization = `Bearer ${options.token}`
	const body = options.body === undefined ? null : JSON.stringify(options.body)
	const res = await window.palot.fetch({
		url: `${SUB2API_BASE_URL}${path}`,
		method: options.method ?? "GET",
		headers,
		body,
	})
	const text = res.body ?? ""
	const payload = text ? (JSON.parse(text) as Sub2ApiEnvelope<T>) : undefined
	if (res.status < 200 || res.status >= 300 || !payload || payload.code !== 0) {
		throw new Error(payload?.message || `请求失败：HTTP ${res.status}`)
	}
	return payload.data as T
}

async function sub2apiRequestWithFallback<T>(
	paths: string[],
	options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
	let lastError: unknown = null
	for (const path of paths) {
		try {
			return await sub2apiRequest<T>(path, options)
		} catch (err) {
			lastError = err
		}
	}
	throw lastError instanceof Error ? lastError : new Error("请求失败")
}

async function getDefaultGroupID(token: string): Promise<number> {
	const groups = await sub2apiRequest<Sub2ApiGroup[]>("/api/v1/groups/available", { token })
	const group = groups.find(
		(item) => item.name === CODEY_DEFAULT_GROUP_NAME && item.status !== "inactive",
	)
	if (!group) {
		throw new Error(
			`${CODEY_DEFAULT_GROUP_NAME} 服务组暂时不可用，请联系管理员确认账号分组权限。`,
		)
	}
	return group.id
}

async function configureOpenAIProvider(apiKey: string): Promise<void> {
	const client = getBaseClient()
	if (!client) throw new Error("本地 Agent 服务尚未连接，请稍后重试。")

	await client.auth.set({
		providerID: "openai",
		auth: { type: "api", key: apiKey },
	})
	await client.global.config.update({
		config: {
			provider: {
				openai: {
					options: {
						baseURL: SUB2API_OPENAI_BASE_URL,
					},
				},
			},
		},
	})
	await client.global.dispose()
}

export function Sub2ApiAuthDialog({ open, onOpenChange, onConnected }: Sub2ApiAuthDialogProps) {
	const [mode, setMode] = useState<Mode>("login")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [verifyCode, setVerifyCode] = useState("")
	const [promoCode, setPromoCode] = useState("")
	const [invitationCode, setInvitationCode] = useState("")
	const [totpCode, setTotpCode] = useState("")
	const [tempToken, setTempToken] = useState("")
	const [maskedEmail, setMaskedEmail] = useState("")
	const [loading, setLoading] = useState(false)
	const [sendingCode, setSendingCode] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState<string | null>(null)

	const title = useMemo(() => {
		if (mode === "register") return "注册 Codey 账号"
		if (mode === "two-factor") return "两步验证"
		return "登录 Codey 账号"
	}, [mode])

	const resetResult = useCallback(() => {
		setError(null)
		setSuccess(null)
	}, [])

	const completeWithToken = useCallback(
		async (auth: AuthData) => {
			if (auth.requires_2fa && auth.temp_token) {
				setTempToken(auth.temp_token)
				setMaskedEmail(auth.user_email_masked ?? "")
				setMode("two-factor")
				return
			}
			if (!auth.access_token) {
				throw new Error("登录成功但没有返回访问令牌。")
			}

			const groupID = await getDefaultGroupID(auth.access_token)
			const deviceId = getDeviceId()
			const keyName = `Codey Desktop - ${deviceId}`
			const list = await sub2apiRequestWithFallback<PaginatedKeys>(
				["/api/v1/keys?page=1&page_size=100", "/api/v1/api-keys?page=1&page_size=100"],
				{ token: auth.access_token },
			)
			const existing = list.items?.find(
				(item) =>
					item.name === keyName &&
					item.status !== "inactive" &&
					(item.group_id === groupID || item.group?.id === groupID),
			)
			const apiKey =
				existing?.key ??
				(
					await sub2apiRequestWithFallback<ApiKeyData>(["/api/v1/keys", "/api/v1/api-keys"], {
						method: "POST",
						token: auth.access_token,
						body: { name: keyName, group_id: groupID },
					})
				).key

			await configureOpenAIProvider(apiKey)
			setSuccess("账号已连接，Codey 已自动配置专用模型网关。")
			onConnected()
		},
		[onConnected],
	)

	const handleLogin = useCallback(async () => {
		resetResult()
		setLoading(true)
		try {
			const auth = await sub2apiRequest<AuthData>("/api/v1/auth/login", {
				method: "POST",
				body: { email: email.trim(), password },
			})
			await completeWithToken(auth)
		} catch (err) {
			setError(err instanceof Error ? err.message : "登录失败")
		} finally {
			setLoading(false)
		}
	}, [email, password, completeWithToken, resetResult])

	const handleRegister = useCallback(async () => {
		resetResult()
		setLoading(true)
		try {
			const auth = await sub2apiRequest<AuthData>("/api/v1/auth/register", {
				method: "POST",
				body: {
					email: email.trim(),
					password,
					verify_code: verifyCode.trim(),
					promo_code: promoCode.trim(),
					invitation_code: invitationCode.trim(),
				},
			})
			await completeWithToken(auth)
		} catch (err) {
			setError(err instanceof Error ? err.message : "注册失败")
		} finally {
			setLoading(false)
		}
	}, [email, password, verifyCode, promoCode, invitationCode, completeWithToken, resetResult])

	const handleTwoFactor = useCallback(async () => {
		resetResult()
		setLoading(true)
		try {
			const auth = await sub2apiRequest<AuthData>("/api/v1/auth/login/2fa", {
				method: "POST",
				body: { temp_token: tempToken, totp_code: totpCode.trim() },
			})
			await completeWithToken(auth)
		} catch (err) {
			setError(err instanceof Error ? err.message : "验证失败")
		} finally {
			setLoading(false)
		}
	}, [tempToken, totpCode, completeWithToken, resetResult])

	const handleSendVerifyCode = useCallback(async () => {
		resetResult()
		setSendingCode(true)
		try {
			await sub2apiRequest("/api/v1/auth/send-verify-code", {
				method: "POST",
				body: { email: email.trim() },
			})
			setSuccess("验证码已发送，请查看邮箱。")
		} catch (err) {
			setError(err instanceof Error ? err.message : "发送验证码失败")
		} finally {
			setSendingCode(false)
		}
	}, [email, resetResult])

	const canSubmit =
		mode === "two-factor" ? !!tempToken && totpCode.trim().length === 6 : !!email.trim() && !!password

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						登录后会自动创建或复用本设备专用凭证，并绑定 codex-0.25 服务组。
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{mode !== "two-factor" ? (
						<>
							<div className="space-y-2">
								<Label htmlFor="sub2api-email">邮箱</Label>
								<Input
									id="sub2api-email"
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@example.com"
									disabled={loading}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="sub2api-password">密码</Label>
								<Input
									id="sub2api-password"
									type="password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									placeholder="请输入密码"
									disabled={loading}
								/>
							</div>

							{mode === "register" && (
								<>
									<div className="space-y-2">
										<Label htmlFor="sub2api-verify-code">邮箱验证码</Label>
										<div className="flex gap-2">
											<Input
												id="sub2api-verify-code"
												value={verifyCode}
												onChange={(event) => setVerifyCode(event.target.value)}
												placeholder="可选，按站点配置填写"
												disabled={loading}
											/>
											<Button
												type="button"
												variant="outline"
												onClick={handleSendVerifyCode}
												disabled={sendingCode || !email.trim()}
											>
												{sendingCode && <Spinner className="size-4" />}
												发送
											</Button>
										</div>
									</div>
									<div className="grid grid-cols-2 gap-2">
										<div className="space-y-2">
											<Label htmlFor="sub2api-promo">优惠码</Label>
											<Input
												id="sub2api-promo"
												value={promoCode}
												onChange={(event) => setPromoCode(event.target.value)}
												placeholder="可选"
												disabled={loading}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="sub2api-invite">邀请码</Label>
											<Input
												id="sub2api-invite"
												value={invitationCode}
												onChange={(event) => setInvitationCode(event.target.value)}
												placeholder="可选"
												disabled={loading}
											/>
										</div>
									</div>
								</>
							)}
						</>
					) : (
						<div className="space-y-2">
							<Label htmlFor="sub2api-totp">两步验证码</Label>
							<Input
								id="sub2api-totp"
								value={totpCode}
								onChange={(event) => setTotpCode(event.target.value)}
								placeholder={maskedEmail ? `发送到 ${maskedEmail}` : "请输入 6 位验证码"}
								disabled={loading}
							/>
						</div>
					)}

					{error && (
						<div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</div>
					)}
					{success && (
						<div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
							<CheckCircle2Icon className="size-4" />
							{success}
						</div>
					)}
				</div>

				<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
					<a
						href={SUB2API_BASE_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
					>
						打开账号中心
						<ExternalLinkIcon className="size-3" />
					</a>
					<div className="flex gap-2">
						{mode !== "two-factor" && (
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									resetResult()
									setMode(mode === "login" ? "register" : "login")
								}}
								disabled={loading}
							>
								{mode === "login" ? "去注册" : "去登录"}
							</Button>
						)}
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							取消
						</Button>
						<Button
							type="button"
							disabled={!canSubmit || loading}
							onClick={
								mode === "register"
									? handleRegister
									: mode === "two-factor"
										? handleTwoFactor
										: handleLogin
							}
						>
							{loading && <Spinner className="size-4" />}
							{mode === "register" ? "注册并连接" : mode === "two-factor" ? "验证并连接" : "登录并连接"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
