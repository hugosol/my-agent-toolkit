# 10: Extension configuration

**What to build:** 扩展以**纯数据**声明它需要的配置键与类型，框架按扩展目录下的 `config.yaml` 约定（路径可覆盖）在 binding 时、注册任何东西之前读取并校验；缺失或非法一律让该扩展不加载并报确定性 error，其它扩展继续，**没有代码级默认值或回退**。仓库里提交的 `config.yaml` 就是默认值。Configuration switch 语义保持 deferred，本票只让文件形态与命名可承载它。

**Delivers:** P19, P20

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] definition 的 `config` 是纯数据：`path` 可覆盖 + `fields` 声明必填键与类型（`string` | `non-empty-string` | `number` | `boolean`）
- [ ] 未声明 `config` 的扩展完全无感（既有扩展零改动）
- [ ] 所有加载期配置错误走同一条路径并产出 `BindingFailure{kind:"configuration", violation:{kind:"config", detail}}` + 经非模型通道报确定性 error + 该扩展不加载：
  - 声明形状非法：`config` 非对象、`fields` 非非 null 对象、类型名超出四种、`path` 非非空字符串
  - 文件侧非法：缺文件、坏 YAML、顶层非对象、必填键缺失、类型不符
- [ ] `detail` 逐类可区分
- [ ] 校验语义由框架完成（如 `non-empty-string` 拒绝空串）
- [ ] 已绑定扩展误用配置读取 API 时抛独立的配置误用错误，与加载期失败不混为一类
- [ ] 读取/解析/校验只有一份实现且 parser 可注入；解析用纯 JS 的 `yaml`（零外部依赖），framework core 不绑 Bun / agent runtime API
- [ ] 未知键忽略；无 env/CLI 覆盖；整机唯一一份；改动需整进程重启
- [ ] 共享逻辑经 `getConfig(definition)` 拿已校验值，装配层完全不接触配置
- [ ] F 层测试覆盖全部失败路径与成功路径；`docs/framework-capabilities.md` 补 `ConfigurationViolationKind` 新成员，并把 `ConfigurationViolation`/`"configuration"` 的注释从「竞争性声明」泛化为「配置规则（声明 + 文件）」

**来源:** contract P19、P20；spec §6、故事 49–56；lighthouse 05（含 traverse 修订）
