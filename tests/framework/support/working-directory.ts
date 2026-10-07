/**
 * Running a block from a chosen process working directory.
 *
 * A suite uses this to put the process somewhere the behavior under test must not depend on: an
 * extension's declared configuration file is resolved against the extension repository root its
 * assembly supplies, so a load that happens to run in the repository proves nothing about the
 * resolution — one that runs outside it does. The directory is restored once `run` settles,
 * including when it rejects.
 *
 * The window covers an await, because a real loader call has one. Test files run one after
 * another in one process, so nothing else observes the directory while a test body holds it.
 */
export async function inWorkingDirectory<T>(directory: string, run: () => T | Promise<T>): Promise<T> {
	const previous = process.cwd();
	process.chdir(directory);
	try {
		return await run();
	} finally {
		process.chdir(previous);
	}
}
