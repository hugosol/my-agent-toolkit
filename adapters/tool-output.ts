/// <reference lib="es2022.intl" />

import { stripVTControlCharacters } from "node:util";
import type { ToolExecutionResult } from "../framework/interface/tool";

export interface NativeToolOutputOptions {
	readonly expanded: boolean;
	readonly isPartial: boolean;
}

export const plainText = (text: string) => stripVTControlCharacters(text).replace(/\t/g, "    ").replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, "");

const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const ascii = /^[ -~]$/;

function cutAt(text: string, width: number): number {
	let cells = 0;
	for (const { segment, index } of segments.segment(text)) {
		// Non-ASCII graphemes may be wide (including ambiguous-width characters).
		// Budget two cells for each rather than risking terminal auto-wrap.
		cells += ascii.test(segment) ? 1 : 2;
		if (cells > width) return index;
	}
	return text.length;
}

export function clipToolOutput(line: string, width: number): string {
	const text = plainText(line);
	return cutAt(text, width) === text.length ? text : width === 1 ? "." : text.slice(0, cutAt(text, width - 2)) + "…";
}

export function toolBusinessText(result: ToolExecutionResult): string {
	return result.content.map(block => block.text).join("\n");
}

export function toolOutputComponent(lines: readonly string[] | undefined, result: ToolExecutionResult, options: NativeToolOutputOptions) {
	const content = toolBusinessText(result);
	return {
		render(width: number): readonly string[] {
			if (width < 1) return [];
			const rows = lines?.map(line => clipToolOutput(line, width)) ?? [];
			if (!content) return rows;
			if (rows.length) rows.push("");
			const limit = options.expanded ? Infinity : rows.length + 8;
			for (const line of content.split("\n")) {
				let remaining = plainText(line);
				do {
					if (rows.length >= limit) return [...rows, "…"];
					const end = cutAt(remaining, width);
					if (end === remaining.length) { rows.push(remaining); break; }
					if (end === 0) {
						rows.push("…");
						remaining = remaining.slice(segments.segment(remaining).containing(0)!.segment.length);
					} else {
						rows.push(remaining.slice(0, end));
						remaining = remaining.slice(end);
					}
				} while (remaining);
			}
			return rows;
		},
		invalidate() {},
	};
}
