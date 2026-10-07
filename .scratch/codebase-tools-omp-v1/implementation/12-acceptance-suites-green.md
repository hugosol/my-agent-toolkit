# 12: 两套自动化套件在 18.5.0 全绿

**What to build:** 在固定基线上跑通两套分目录、分责任的自动化套件：`tests/codebase-tools/`（消费者可见行为，B1–B11）与 `tests/framework/`（C1–C15 必须语义，兼 Agent 运行时升级回归警报），并覆盖负例 N1–N10。永久断言只覆盖消费者可见行为与必须语义，不 pin 提示词文案、文件布局、转发实现或测试后门；临时探针不冒充永久回归；mock 不冒充 provider、task 或 TUI 证据。这是整条链路的集成验证点：任何一项贡献能力未落地，此票不予关闭。

**Delivers:** P33

**Blocked by:** 04、05、06、07、08、09、10、11

**Status:** ready-for-agent

- [ ] `tests/codebase-tools/` 覆盖 B1–B11 且全绿
- [ ] `tests/framework/` 覆盖 C1–C15 且全绿，含 C14 拒绝路径真跑
- [ ] 负例 N1–N10 各有对应检查或明确记录类结论（N3、N10 为记录类）
- [ ] 断言审查通过：无 wiring/copies/forwarding/mock echo/源码文本/套套逻辑/仅非空类断言
- [ ] 两套套件的运行命令与结果可重复执行，并留有证据
