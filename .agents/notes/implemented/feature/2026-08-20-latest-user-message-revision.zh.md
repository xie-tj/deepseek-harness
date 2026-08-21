# Agent Note: 最新直接人类消息修订

Status: implemented

English | [中文](2026-08-20-latest-user-message-revision.md)

## Problem

Web 对话需要允许用户修正最新的直接人类文本并重新发送，同时不修改追加式会话日志。活动 transcript、模型历史、搜索结果和导出必须停止暴露被替换的尾部，而持久化审计数据和外部副作用保持不变。

## Decision

Host 只接受由精确 `messageId` 和事件 `seq` 标识的、可见的最新直接人类消息修订，且原消息内容必须是非空纯文本。Agent 必须空闲、没有排队工作或待处理交互，替换内容只能包含文本块。接纳以及排队／审计发布在 agent maintenance 中执行；审计追加失败时会移除已排队的替换。Host 排队一个带内部 replace 意图的新 `UserMessage`，该意图引用从目标到尾部的全部当前 surface 事件。

Agent loop 在追加替换 `user/message` 前剥离内部意图。持久事件使用 `surfaceOp: { op: 'replace', start, end }` 和 `sourceEventSeqs`；Host 另外追加可忽略的 `session/revision` 审计记录。当前历史和导出投影移除被取代的范围，直到审计记录所记录的接纳边界为止；追加式 artifact 仍保留这些事件，而替换回合自身在该边界之后追加的生命周期事件会在投影中保留。修订保留会话身份，不回滚工具调用、文件修改或其他外部副作用。

浏览器只在最新直接人类文本消息旁显示 Edit 操作——无论该消息处于已落定状态还是被认领为 steering；两种分类都是直接人类输入，Host 修订接口两者都接受。内联编辑器与 composer 草稿分离，Enter 发送，Shift+Enter 换行，Escape 取消；拒绝或发送失败时保留编辑文本。编辑时编辑器以气泡同款卡片呈现，原位替换已落定气泡与行内操作。非文本消息不显示该操作；运行时不可用时保留显示但禁用编辑。

该操作是可独立加载的 `@deepseek-ai/dsh-session-message-revision` Client 插件。`client-ui-conversation` 拥有增量 `conversation.chat.user-actions` Slot（被认领的消息通过镜像的 steering 孪生座位接入）并传递消息数据；插件调用 scoped `SessionBinding.session.reviseLatestUser` 接口，不替换内置消息渲染器。

## Alternatives considered

**修改或删除原始事件。** 拒绝，因为持久会话要求追加式历史，回放必须保留原始证据。

**新增可变的对话历史存储。** 拒绝，因为模型历史、transcript 历史、搜索和导出需要分别同步；已有的 surface 替换协议已经提供可回放的投影语义。

**在运行或排队期间允许修订。** 拒绝，因为替换范围和 agent 回合接纳会与活动 inbox、交互状态竞争；调用方改为收到带类型的不可用错误。

**尝试撤销外部副作用。** 拒绝，因为工具、文件系统和网络副作用无法事务性逆转；UI 明确说明编辑只改变后续对话。

## Consequences

每次接受的修订都会创建新的序列号和消息身份，同时保留会话 id 与折叠后的标题；替换消息取消由被取代尾部派生的进行中或待处理标题生成，且不会重新触发自动标题生成。修订可以重复进行：每次替换引用当前 surface 尾部，因此早期重写尾部会从当前投影中消失，但不会从存储中删除。用量记录仍属于持久日志，不会被追溯调整。

较旧运行时可以通过 `ignorable` 标记跳过审计事件；替换 surface 事件仍是模型可见历史的重建记录。

## Testing

Host RPC 测试覆盖接受、持久审计数据、当前历史投影、过期目标拒绝、已有非文本或空白目标拒绝，以及审计发布失败时的队列回滚。Agent-loop 测试验证内部元数据被移除且持久 surface 意图被规范化。Session-title 测试验证替换后保留折叠标题，并证明进行中的 provider 调用会被取消而不是追加过期标题。历史与导出投影测试按生产事件顺序固定断言——先审计、再替换回合生命周期记录、最后替换消息——防止删除端点回退吞掉未引用的新事件。Runtime、核心 UI 和独立插件测试覆盖增量最新用户推导、分页间隔、Session 接口调用、内联 Enter 重发操作、增量 Slot、Loader 组合、卸载和运行中不可用状态。GUI lane 与 Host/Client 类型检查覆盖组合后的接口。
