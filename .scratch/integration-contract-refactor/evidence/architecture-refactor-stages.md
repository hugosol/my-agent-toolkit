### 8.4 重构阶段


切换按阶段实现，每阶段都保持仓库 typecheck 和当时测试绿色：

1. **interface 成为 canonical：** extension-facing 类型迁入 `framework/interface/`；内部 module 从 interface import；adapter-facing 类型迁入 `framework/runtime/port.ts`；extension import 迁移到 interface 和 adapter assembly entry；import boundary 规则生效；旧 `framework/public.ts` 移除，无 alias/re-export/forwarding shell。
2. **runtime port：** `runtime/port.ts` 承载框架形状的 adapter 契约；引用 interface canonical 声明，不重述；adapter 从 runtime/port import，extension 不 import。
3. **Session 读表面积：** 只读；具体 observation source 与 mutation 方法保持内部。按 capability 分组整个 implementation context 被考虑但未采纳；`context.session` 保持 capability object，config/modelPrices/providerAccess 保持扁平命名。
4. **深 module：** State、Session 先落到 interface 后面；Round、Turn、Activity、Context、observation、access、disposal 保持内部 Session module；Command、Prompt、Marker、Feedback、Provider、General 跟上；composition 连接 capability 与 port，不拥有 capability 规则。
5. **文档与决策：** `framework/interface/README.md` 承载 capability-to-import map；README、framework-capabilities、extension-development-map 跟随实现；ADR-0002 修正记录接受方向和未采纳候选；旧公共路径与 extension import 例外移除。

完整证据与逐阶段记录见[接入契约重构摘要](integration-contract-refactor.md)。这些记录描述当时的源码和环境，不构成当前工作树的持续保证。

