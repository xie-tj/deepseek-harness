# Agent Note: 在 Cordis 预设之间共享固定的 Host inspect provider

Status: implemented

[English](2026-08-17-shared-cordis-inspect-providers.md) | 中文

## Problem

Agent preset 会按 preset id 各自挂载一份常驻 composition。用户复制随附的 `cordis` preset 后，复制品会在原 preset 旁挂载第二份 `tool-cordis` composition。两份 composition 都向进程全局的 Host inspect registry 注册固定的 `Service`、`Event`、`Builtin` 和 `Tool` provider。registry 的普通重复检查会拒绝第二组 provider，因此第一份 Cordis preset 仍处于挂载状态时，从复制 preset 创建 Session 会以 `agent-preset-invalid` 失败。

Host inspect 目录与 Client 查询路由按设计属于整个进程，而每次查询已经显式携带发起请求的 Agent。四个 provider 在不同 `tool-cordis` 挂载之间具有相同的 manifest 和行为；只有 `Tool.listTools` 读取 Agent 特定状态，并且它通过该显式查询上下文读取。这一归属模型由更完整的 [Cordis 动态包设计](../../proposed/architecture/2026-08-08-cordis-web-dynamic-packages.zh.md#inspect-providers-and-catalogs)说明。

## Decision

`CordisInspectRegistryService.register()` 保留严格的单一所有者注册语义。`registerShared()` 是多个独立挂载的所有者贡献同一固定 provider 定义时使用的显式操作。它校验 manifest，仅共享完全一致的定义，保留第一份查询 handler，统计所有者引用，并在最后一个幂等 disposer 执行后移除 provider。发生普通注册冲突或共享注册的 manifest 不同时仍会明确失败。

`tool-cordis` 仅对生成的 `Service`、`Event` provider 以及固定的 `Builtin`、`Tool` provider 使用 `registerShared()`。调用方有责任保证相同 manifest 对应的每个 handler 在行为上可互换；实现随所有者变化的 provider 必须使用不同 id、在查询内部按 Agent 寻址，或改由 host 侧唯一注册。

## Alternatives considered

**把四个 provider 移入 Web host composition。** 这同样能避免重复注册，但会使 provider 目录在所有 `tool-cordis` 挂载结束后继续存在，并让 Web bundle 承担 tool package 的所有权。引用计数注册使 provider 的可用期仍由贡献该能力的 composition 决定。

**让 Host inspect registry 按 Agent 分层。** 该 registry 还拥有整个进程唯一的 Client manifest 镜像和待完成的跨页面查询路由。按 Agent 复制会引入相互冲突的 Client 目录与路由生命周期，而查询本身已经携带 Agent。

**忽略所有重复的 provider id。** 仅有 id 不能证明 schema 或行为一致，而且第一位所有者释放时可能移除其他 preset 仍需要的 provider。完全一致的 manifest 检查与引用所有权同时保留冲突检测和生命周期。

**用最新注册替换当前 handler。** 挂载与释放顺序会决定行为，最新所有者移除后还需要恢复旧 closure。保留一个可互换的 handler 不需要维护所有权栈；不可互换的 handler 不具备共享注册资格。

## Consequences

随附的 Cordis preset 与任何行为相同的用户复制品可以同时保持挂载，因此 Session 创建不再取决于哪个 preset 先注册 Host inspection。provider 列表对每个固定 id 只显示一行，任意一份 preset 被释放后，provider 都会保留到最后一位所有者释放为止。

聚焦 registry 的覆盖固定了共享生命周期和最终移除。真实的随附 Web composition 测试会同时挂载随附的 `cordis` preset 与一份用户复制品，并验证两个 Agent 都获得 Cordis 工具。普通重复注册继续严格失败，不同的共享 manifest 也继续报错；未来新增共享 provider 调用点时必须证明 handler 等价与释放行为，不能把 `registerShared()` 当作通用的重复抑制。
