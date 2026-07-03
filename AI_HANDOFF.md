# AI Handoff：Palot 改造成中文 Codex 平替

最后更新：2026-07-03

本仓库是用户 fork 的 Palot，远端为 `https://github.com/imwangji/palot.git`。用户明确要求：不要给 upstream 提 PR，直接在自己 fork 的 `main` 分支提交和推送。

## 产品目标

做一个中文 Codex 平替桌面端：

- 用户下载安装后直接可用，不额外安装 `opencode` / OpenCode CLI。
- 用户使用 `sub2api.bywangji.com` 账号登录/注册/充值。
- 客户端登录后自动创建或复用本设备专用 API Key，不让普通用户手动填 OpenAI Key。
- 模型调用统一走 `https://sub2api.bywangji.com/v1`。
- UI 面向中文用户，逐步隐藏 OpenCode/OpenAI/API Key 等上游概念。

## 当前关键提交

```text
d194a5a Add sub2api account login flow
7d1d416 Localize UI and bundle OpenCode
85f7aa8 Merge pull request #1 from imwangji/codex/sub2api-integration
4f4a85e Integrate sub2api provider setup
fd63a75 chore: version packages (#62)
```

## 已完成

### 内置 OpenCode / Agent 引擎

相关文件：

```text
apps/desktop/src/main/opencode-binary.ts
apps/desktop/src/main/opencode-manager.ts
apps/desktop/src/main/compatibility.ts
```

要点：

- 已加入 `opencode-ai@1.17.13`。
- 打包后优先使用 `resources/opencode/opencode.exe`。
- Windows x64 安装包已能启动内置 Agent。
- 为内置 OpenCode 设置 Palot 专用环境：
  - `XDG_CONFIG_HOME = app.getPath("userData")/opencode-config`
  - `XDG_DATA_HOME = app.getPath("userData")/opencode-data`
- 这是为了避开用户全局 `C:\Users\Administrator\.config\opencode` 状态导致的 `EEXIST` 启动失败。

### sub2api 登录/注册接入

相关文件：

```text
apps/desktop/src/renderer/components/settings/sub2api-auth-dialog.tsx
apps/desktop/src/renderer/components/settings/provider-settings.tsx
apps/desktop/src/renderer/components/onboarding/steps/provider-setup-step.tsx
apps/desktop/src/renderer/lib/providers.ts
```

当前对接：

```text
SUB2API_BASE_URL = https://sub2api.bywangji.com
OpenAI-compatible baseURL = https://sub2api.bywangji.com/v1
```

实现流程：

1. 用户在首次引导或设置页点击“登录 / 注册”。
2. 调 sub2api：
   - `POST /api/v1/auth/login`
   - `POST /api/v1/auth/register`
   - `POST /api/v1/auth/login/2fa`
   - `POST /api/v1/auth/send-verify-code`
3. 登录后列出或创建 API Key：
   - `/api/v1/keys`
   - 兼容 `/api/v1/api-keys`
4. Key 名称为：

```text
Desktop Agent - {deviceId}
```

5. 自动写入 OpenCode provider：

```ts
client.auth.set({
  providerID: "openai",
  auth: { type: "api", key: apiKey },
})

client.global.config.update({
  config: {
    provider: {
      openai: {
        options: {
          baseURL: "https://sub2api.bywangji.com/v1",
        },
      },
    },
  },
})
```

网络请求走 `window.palot.fetch`，即 Electron main process 的 `net.fetch` 代理。

### 中文化和乱码处理

已处理：

- 首次引导从 “AI Providers” 改为“登录旺记账号”。
- OpenAI provider 连接入口改为 sub2api 登录弹窗。
- 安装向导不再展示 `where opencode` 的多路径输出，避免中文路径乱码。
- 部分设置页按钮和状态已汉化。

## 构建和验证命令

在仓库根目录：

```powershell
.\node_modules\.bin\tsgo.exe --noEmit --project apps\desktop\tsconfig.json
```

在 `apps\desktop`：

```powershell
..\..\node_modules\.bin\electron-vite.exe build
..\..\node_modules\.bin\electron-builder.exe --win --x64 --config electron-builder.yml --publish never
```

最近一次验证：

- 类型检查通过。
- `electron-vite build` 通过。
- `electron-builder --win --x64` 通过。
- 启动 `apps/desktop/release/win-unpacked/Palot.exe` 后：

```text
http://127.0.0.1:4101/session -> HTTP 200
```

Windows x64 安装包位置：

```text
apps/desktop/release/Palot-0.11.0-win-x64.exe
```

注意：`release/` 通常不被 git 跟踪，安装包需要在本机生成或另行发布。

## 已知风险

### 凭证安全

当前登录流程在 renderer 里完成，虽然网络请求通过 main process 代理，但 renderer 仍会接触 `access_token` 和 sub2api API Key。

下一步建议：

- 把 sub2api auth、refresh、API Key 创建/复用移到 Electron main process IPC。
- JWT、refresh token、Desktop Agent API Key 存 `safeStorage` 或系统凭据。
- renderer 只拿账号状态、邮箱、余额、套餐信息。

### 中文化未完成

主路径已中文化，但高级设置、迁移工具、自动化页面等仍有英文残留。下一步继续扫：

```text
apps/desktop/src/renderer/components
```

### 品牌未替换

当前仍叫 Palot。产品化需要改：

- app 名称
- 安装包名
- 图标
- 窗口标题
- 托盘文案
- GitHub release / 官网下载页

### 账号中心未完成

后续需要接：

```text
/api/v1/user/profile
/api/v1/user/subscriptions/active
/api/v1/user/subscriptions/summary
/api/v1/user/subscriptions/progress
/api/v1/usage/dashboard/*
/api/v1/payment/plans
/api/v1/payment/channels
/api/v1/payment/orders
/api/v1/payment/orders/verify
```

用于余额、套餐、充值和用量统计。

## 下一步优先级

1. 用真实 `sub2api.bywangji.com` 账号测试登录、注册、2FA、创建 Key、拉模型列表和真实对话。
2. 如果模型调用失败，检查 OpenCode 配置是否写入 `openai.options.baseURL = https://sub2api.bywangji.com/v1`。
3. 把 sub2api 凭证流程迁到 main process 并做安全存储。
4. 做账号中心：邮箱、余额、套餐、充值入口、用量。
5. 全量中文化。
6. 替换 Palot 品牌。
7. 做自动发布 Windows/macOS 安装包。

## 外层项目上下文

如果本仓库位于完整工程目录中，外层还有更详细的文档：

```text
../PROJECT_CONTEXT.md
```

完整工程建议放在：

```text
D:\2_code_project\codex尝试平替
```
