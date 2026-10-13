/**
 * The entry's display preference: which form that CLI's usage widget is drawn in.
 *
 * It is memory alone, and it belongs to the entry — one business instance, one CLI process — rather
 * than to a session, a viewed target or an account: an ordinary model, session, tree or view change
 * keeps it, a restart or a reload answers `brief` again, nothing on the storage root holds it, and no
 * second entry and no subagent inherits it. `/budget detail` is the one thing that flips it, and that
 * flip is immediate: it consults no provider, no idle fact and no pending save. The flip announces
 * the new form through the same change notification every other read-only result of this extension
 * uses, so a frontend that already re-reads on a change draws the new form without a second channel.
 */
export type DisplayForm = "brief" | "detail";

/** The display form one entry is in, and the one flip the entry's own command performs. */
export interface DisplayPreference {
	/** The form this entry is in now. */
	form(): DisplayForm;
	/** Flip to the other form, announce the change, and answer with the form now in effect. */
	toggle(): DisplayForm;
}

/** What one entry's preference is built from: the change notification its flip publishes. */
export interface DisplayPreferenceInputs {
	/** Tells the entry's readers that a result they read changed, so they read it again. */
	readonly onChange: () => void;
}

/**
 * Build one entry's display preference. It starts on the brief, which is what a fresh process and a
 * reload answer with, and it holds nothing else.
 */
export function createDisplayPreference(inputs: DisplayPreferenceInputs): DisplayPreference {
	let form: DisplayForm = "brief";
	return {
		form: () => form,
		toggle: () => {
			form = form === "brief" ? "detail" : "brief";
			inputs.onChange();
			return form;
		},
	};
}

/** What one flip answers: the form now in effect, and what that form draws itself from. */
export function displayFormNotice(form: DisplayForm): string {
	return form === "detail"
		? "展示已切换为详细（detail）：保留顶部 Total，并在 Round 位置显示静态代理树。"
		: "展示已切换为简略（brief）：显示 Total 与 Round。";
}
