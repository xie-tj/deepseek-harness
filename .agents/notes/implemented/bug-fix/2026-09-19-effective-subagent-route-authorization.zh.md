# Agent Note: 生效 subagent 路由授权

Status: implemented

[English](2026-09-19-effective-subagent-route-authorization.md) | 中文

## 问题

`subagent/model-selection-policy` 事件记录精确的用户授权决定，因此无论子级路由如何提供，每条具体子级路由都必须遵守它。

## 决策

存在已记录策略时，`dsh-tool-subagent` 会从提供方默认值、工具配置、模型字段和父级继承中解析生效 provider/model，并在 LLM 预检或创建子级前拒绝策略外的路由。

省略面向模型的字段不会绕过授权：省略的调用必须解析为已授权路由，缺少生效 provider/model 时会拒绝。

没有已记录策略的定义会保留原有提供方路径；对于原本纯粹继承的路由，不要求可选 LLM 服务。

## 考虑过的替代方案

**只授权面向模型的字段。** 不采用，因为配置、提供方持有和继承的默认值仍会选择实际运行子级的模型。

**信任配置或提供方持有的默认值。** 不采用，因为部署默认值可以把实际子级路由改到 Session 持久用户决定之外。

**在创建子级后校验。** 不采用，因为子级可能在授权失败传回调用方前开始工作。

## 结果

- Session 所有者必须把子级可从配置、提供方或父级导出的每条路由列入已记录策略。
- 已启用策略会通过 `ctx.llm` 预检每条子级路由；缺少 LLM 服务会拒绝，而不是在未经检查的路由上委派。
- 聚焦执行测试覆盖父级、配置和提供方持有的默认值，包括允许的提供方默认值。

## 相关决策

本决定细化[模型选择的 subagent 路由](../feature/2026-08-18-model-selected-subagent-routes.zh.md)与[用户授权的 subagent 模型路由](../feature/2026-08-24-user-authorized-subagent-model-routes.zh.md)。
