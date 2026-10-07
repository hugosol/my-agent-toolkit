# 09: marker 统一区与无 UI 路径

**What to build:** marker 进框架统一区（单一 key 与 placement 由框架拥有），按扩展 `id` 稳定排序；State 为 true → 显示、false → 移除、每启用轮重设、区域为空则清除，扩展无法抢占 widget。`hasUI:false` 时 marker 整体 no-op、通知走 stderr，且不崩溃。

**Delivers:** P13、P14

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] marker 出现在框架统一区、按 `id` 稳定排序，不由扩展抢 widget（C10）
- [ ] 每启用轮重设；off 时清除；区域为空时清除（B6）
- [ ] `hasUI:false`：marker 整体 no-op、通知走 stderr、不崩溃（N9）
- [ ] marker 生命周期完全由 State 驱动，renderer 只读
