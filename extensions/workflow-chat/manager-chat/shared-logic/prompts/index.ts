import init from "./init.md" with { type: "text" };
import { INIT_PROMPT as CHIEF_REPORT_GUIDANCE } from "../../../chief-report/shared-logic/prompts";

export const INIT_PROMPT = `${init.trimEnd()}\n\n当本次工作由 chief 实际委派时，使用 chief 报告工具交接结果；具体资格由后端确认。该职责不改变你的业务工作或内部 Run 管理职责。\n\n${CHIEF_REPORT_GUIDANCE.trim()}`;
