/**
 * Consumption archives: the closed accounting period a reset leaves behind.
 *
 * One archive is the whole activity document a period held at the moment it was closed — every
 * harness and every session record, exactly as the file carried it — plus the two facts only the
 * closing moment can state: the ISO `end` instant, and the DeepSeek balance the period ended at
 * when a reliable reading produced one. It is written *inside* the coordinated scope that reads
 * the activity document and publishes its replacement, so the document an archive holds is the
 * one that was really replaced, and a period that changed underneath is archived as it is rather
 * than from a read taken outside the coordination.
 *
 * The name is a fresh random identifier, and a name already taken is refused rather than written
 * over: archiving closes a period once, and the file an earlier close produced is the record of
 * that period rather than something a later one may replace. Neither the schema version nor the
 * period of an archive is interpreted here — an archive is a document this extension writes and
 * never reads back into the accounting.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConsumptionDocument } from "../accounting/consumption-document";

/** The directory inside the storage root every archive of this extension is written into. */
const ARCHIVE_DIRECTORY = "archives";

/**
 * One closed period's archive: the activity document that period held, and the facts of its end.
 */
export interface ConsumptionArchive extends ConsumptionDocument {
	/** When this period ended, as an ISO instant. */
	readonly end: string;
	/** The DeepSeek balance this period ended at, omitted when no reliable reading produced one. */
	readonly end_bal?: number;
}

/**
 * Why one archive was not written: the archive directory the root names, or the archive name itself,
 * could not be written. Its message is the reason in the operator's own terms — a name already taken
 * says that nothing was overwritten rather than that a write failed.
 */
export class ArchiveFailure extends Error {
	constructor(detail: string) {
		super(detail);
		this.name = "ArchiveFailure";
	}
}

/**
 * Write one closed period's archive under a fresh random name, and answer that name.
 *
 * The file is created with an exclusive create, so a name another archive already holds is refused
 * and its content is left exactly as it was. The archive directory is created when it does not
 * exist yet; a failure to create it or to write the document is that failure, reported as one.
 */
export async function publishArchive(root: string, archive: ConsumptionArchive): Promise<string> {
	const name = `${randomUUID()}.json`;
	const directory = join(root, ARCHIVE_DIRECTORY);
	const target = join(directory, name);
	try {
		await mkdir(directory, { recursive: true });
		await writeFile(target, JSON.stringify(archive), { encoding: "utf8", flag: "wx" });
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		const taken = (error as { readonly code?: unknown } | null)?.code === "EEXIST";
		throw new ArchiveFailure(
			taken ? `归档名「${name}」已被占用，已有归档未被覆盖` : `归档「${target}」未能写入（${reason}）`,
		);
	}
	return name;
}
