/**
 * Onboarding Step 1: Welcome.
 *
 * Brief introduction to Palot and what the setup will cover.
 */

import { Button } from "@palot/ui/components/button"
import { ArrowRightIcon } from "lucide-react"
import { PalotWordmark } from "../../palot-wordmark"

interface WelcomeStepProps {
	onContinue: () => void
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6">
			<div className="w-full max-w-md space-y-8 text-center">
				{/* Logo */}
				<div className="flex justify-center">
					<PalotWordmark className="h-6 w-auto text-foreground" />
				</div>

				{/* Description */}
				<div className="space-y-3">
					<p className="text-lg text-muted-foreground">你的桌面 AI 编程助手。</p>
					<p className="text-sm leading-relaxed text-muted-foreground/70">
						内置本地 Agent 引擎，接入你的 sub2api 账号和模型网关，支持实时输出、
						多会话和项目级工作流。
					</p>
				</div>

				{/* CTA */}
				<div className="space-y-3">
					<Button size="lg" onClick={onContinue} className="gap-2">
						开始使用
						<ArrowRightIcon aria-hidden="true" className="size-4" />
					</Button>
					<p className="text-xs text-muted-foreground/50">初始化只需要不到一分钟。</p>
				</div>
			</div>
		</div>
	)
}
