# @deepseek-ai/dsh-session-message-revision

[English](README.md) | 中文

可选的 Web 消息修订插件：编辑并重新发送最新一条直接人工文本消息。插件通过 `dsh-client-ui-conversation` 提供的增量动作 Slot，将 Edit 放在内置 Copy 按钮旁边，不替换会话消息渲染器。

## 功能

- 只在最新的直接人工消息旁显示 Edit。
- 仅支持文本消息，提交前保留原始文本。
- Enter 发送，Shift+Enter 换行，Escape 取消。
- 使用现有 Session 修订 API，由 Host 校验空闲状态、待处理工作、目标身份和 surface 替换，然后排队新一轮。
- 被替换的尾部从活动模型历史中隐藏；追加日志和持久化副作用仍由各自投影保留。

## 组合配置

```yaml
- id: session-message-revision
  name: '@deepseek-ai/dsh-session-message-revision'
```

标准 Web 组合包含这一行；Profile 也可以省略它以移除该动作。插件要求 `dsh-client-ui-conversation`、`dsh-client-runtime`、`dsh-client-locale` 和对应版本提供的 Session 修订能力，且不替换内置会话消息渲染器。

## 安装

升级到包含此包的 DSH 发行版后重启 Web；不要在该 Profile 中添加 `github:xie-tj/dsh-easy-exit`，否则会重复挂载内置行。

自定义 Profile 可以省略上文组合配置中的行来禁用该操作。

## 开发

```sh
pnpm --filter @deepseek-ai/dsh-session-message-revision bundle
```

修改动作或 Slot 合约后运行 GUI 测试套件：

```sh
pnpm run test:gui
```

## Model Experience

### 最新人工消息修订

#### What the model sees

修改后的文本会作为新的持久化 `user/message` 事件进入下一轮请求，配对的 `session/revision` 记录会从下一次活动请求中隐藏被替换的尾部；追加日志和修订元数据保持不变。

#### Token effect

下一次请求使用修改后的消息和替换后的活动 Surface；被替换的消息及其响应不会再次消耗该请求的 Token。

#### KV Cache effect

修改位置之后的请求前缀发生变化，模型提供方的缓存复用取决于新的 Prompt 前缀。

## 已知限制和后续工作

- 插件依赖对应版本 `deepseek-harness` 提供的 Session 修订能力和用户消息动作 Slot；浏览器插件本身不会新增 Host 协议基础设施。
- 只有最新的直接人工文本消息可编辑（已结算或 steering 均可）；图片、注入上下文和较早的用户消息不可编辑。
- 会话运行中、存在队列或待处理交互、会话关闭或已移除时，Edit 会保留显示但不可用。
