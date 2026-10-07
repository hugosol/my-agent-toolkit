# 02: 薄入口发现、外置资源解析与装载来源互斥

**What to build:** OMP 只发现 OMP 入口目录下每扩展一个薄入口；入口只 re-export 该扩展的 OMP runtime assembly，不含逻辑、不聚合。该 assembly 必须能解析发现目录之外的共享源码、Markdown 文本资源与裸依赖。开发/验收一律 explicit-only 隔离运行（`--no-extensions -e <OMP 入口目录>` + 干净会话 + 临时 agent state），同一进程内同名新旧实现绝不双载 —— 靠装载来源互斥，而不是扩展名去重或 `disabledExtensions`。只承诺整进程重启后源码变更生效。

**Delivers:** P29、P30；P31（开发/验收 explicit-only 隔离运行与「只承诺整进程重启」部分）

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 真实 loader 在 OMP 入口目录只返回一个 codebase-tools 薄入口；无根 `index.ts`、无聚合工厂（C12）
- [ ] 入口从发现目录之外 import 的共享 TS、`*.md`（按文本导入）与裸依赖全部解析成功、0 error（C12）
- [ ] explicit-only 运行下，sibling 仓库里的原 codebase-tools 实现不被发现（同进程零双载）（N8）
- [ ] 记录否决理由：不做名称去重、不用 `disabledExtensions`、不做运行期身份探测
- [ ] 记录只承诺进程重启生效，不引入热重载作为切换机制
