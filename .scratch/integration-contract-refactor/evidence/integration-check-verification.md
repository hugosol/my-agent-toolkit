<a id="verification-record"></a>

## 历史验证记录（2026-10-20）

以下记录来自 [接入契约架构重构汇总](integration-contract-refactor.md) 的 §7.2/§7.3 及该轮工具测试，保留当时的结论与限制；它们不是当前源码的持续保证，也不改变任何 harness 支持状态。

| 记录 | 结果 | 限制 |
| --- | --- | --- |
| 检查器/生成器最终源码的 `bun run check:integrations --json`（§7.2） | 6 个组合无解析诊断；3 个 OMP 组合及 connect-bot/pi 结构通过；codebase-tools/pi 与 model-cost/pi 的必需 `framework:extension-loading` 为 `conditional`，按政策退出 1 | 发生在具体 assembly 输出凭据（§7.3）之前，不代表后续仍为 conditional |
| 加入具体 assembly 输出契约后（§7.3） | 同一 6 个组合全部结构通过、退出 0；model-cost/pi 与 codebase-tools/pi 的加载供给为 `provided`，证据定位到各自 assembly 调用 | 仅结构分析；不证明 provider 注册、子代理加载或原生语义 |
| model-cost/pi 生成预览（§7.3） | 退出 0、0 个文件、0 条诊断 | 预览未写源码；只说明当时无确定缺失接线 |
| 新 adapter 的 CLI/TypeScript 7 smoke | 检查先报告缺口；生成实际 port 引用后因缺 `missing-implementations` 模块产生 TS2307；提供符合契约的导出后编译与检查均退出 0；再次生成不写文件 | 只证明“缺失导出 → 类型/结构完成”的转换，不证明 native 行为 |
| 隐式 delivery 义务 smoke | extension 只订阅 Round、无直接 feedback 读取；检查仍发现所选 port 的规范 payload 缺字段；生成、TS2307、补齐导出、编译与检查 0 | 同上 |
| 分析边界 smoke | 动态能力成员定位诊断并退出 1；adapter 源路径正确归到已有 adapter；越出 `adapters/` 树的生成请求被拒绝且不写文件 | 证明诊断边界，不证明所有动态形式都被覆盖 |
| `bun test tests/integrations tests/framework/pi-adapter-output.test.ts` | 52 通过、0 失败，7 个文件、325 次断言 | 该源码状态的定向测试，不是全仓保证 |
| §7.3 固定源码 `bun run test` | 1508 通过、0 失败，167 个文件、8975 次断言 | 历史全套记录；后续源码变更后需重新运行 |

同一轮的生成器测试还覆盖了“工厂本身可能返回 `undefined`”的失败前/修复后回归，避免把空 assembly 分支误报为 `provided`。生成器不会因为某个可选接入未被选择而擅自启用它。

