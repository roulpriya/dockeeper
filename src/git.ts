import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export class Git {
	private git: SimpleGit;

	constructor(repoPath: string = process.cwd()) {
		this.git = simpleGit(repoPath);
	}

	private isVendoredOrIgnoredFile(filePath: string): boolean {
		const vendoredPatterns = [
			/node_modules/,
			/^\.git\//,
			/dist/,
			/build/,
			/coverage/,
			/\.idea/,
			/\.vscode/,
			/\.DS_Store/,
			/package-lock\.json/,
			/yarn\.lock/,
			/pnpm-lock\.yaml/,
			/\.log$/,
			/\.cache/,
			/\.temp/,
			/\.tmp/,
			/vendor/,
			/target/,
			/\.gradle/,
			/\.maven/,
			/\.next/,
			/\.nuxt/,
			/\.svelte-kit/,
			/__pycache__/,
			/\.pytest_cache/,
			/\.mypy_cache/,
			/\.tox/,
			/venv/,
			/env/,
			/\.venv/,
			/\.env/,
		];

		return vendoredPatterns.some((pattern) => pattern.test(filePath));
	}

	private isBinaryFile(filePath: string): boolean {
		try {
			const buffer = readFileSync(filePath);

			// Check for null bytes which indicate binary content
			for (let i = 0; i < Math.min(buffer.length, 8000); i++) {
				if (buffer[i] === 0) {
					return true;
				}
			}

			// Check file extension
			const ext = path.extname(filePath).toLowerCase();
			const binaryExtensions = [
				".exe",
				".dll",
				".so",
				".dylib",
				".bin",
				".obj",
				".o",
				".a",
				".lib",
				".jpg",
				".jpeg",
				".png",
				".gif",
				".bmp",
				".ico",
				".svg",
				".webp",
				".mp3",
				".mp4",
				".avi",
				".mov",
				".wmv",
				".flv",
				".mkv",
				".wav",
				".ogg",
				".pdf",
				".doc",
				".docx",
				".xls",
				".xlsx",
				".ppt",
				".pptx",
				".zip",
				".rar",
				".7z",
				".tar",
				".gz",
				".bz2",
				".xz",
				".ttf",
				".otf",
				".woff",
				".woff2",
				".eot",
				".class",
				".jar",
				".war",
				".ear",
			];

			return binaryExtensions.includes(ext);
		} catch {
			// If we can't read the file, assume it might be binary
			return true;
		}
	}

	private shouldIncludeFile(filePath: string): boolean {
		return (
			!this.isVendoredOrIgnoredFile(filePath) && !this.isBinaryFile(filePath)
		);
	}

	async gitDiff(base: string, head: string): Promise<string> {
		return this.git.diff([base, head]);
	}

	async isValidRef(ref: string): Promise<boolean> {
		try {
			await this.git.raw(["rev-parse", "--verify", ref]);
			return true;
		} catch {
			return false;
		}
	}

	async compareRefs(
		sourceRef?: string,
		targetRef?: string,
	): Promise<{ diff: string; warnings: string[] }> {
		const warnings: string[] = [];

		// Check for unstaged changes and warn
		const status = await this.git.status();
		if (status.modified.length > 0 || status.not_added.length > 0) {
			warnings.push(
				`Warning: Unstaged changes detected (${status.modified.length} modified, ${status.not_added.length} untracked files). These are not included in diff calculation.`,
			);
		}

		let diff: string;

		if (sourceRef && targetRef) {
			// Compare two specific refs
			diff = await this.gitDiff(sourceRef, targetRef);
		} else if (sourceRef && !targetRef) {
			// Compare source ref with current HEAD
			diff = await this.gitDiff(sourceRef, "HEAD");
		} else {
			// No refs provided - compare staged changes
			if (status.staged.length === 0 && status.renamed.length === 0) {
				warnings.push("No staged changes found to compare.");
				diff = "";
			} else {
				diff = await this.git.diff(["--cached"]);
			}
		}

		return { diff, warnings };
	}

	async getUncommittedChanges(): Promise<string> {
		return this.git.diff();
	}

	async getAllDiffs(): Promise<string> {
		const [status] = await Promise.all([this.git.status()]);

		// Filter files to only include non-binary, non-vendored files
		const stagedFiles = [
			...status.staged,
			...status.renamed.map((f) => f.to),
		].filter((file) => this.shouldIncludeFile(file));
		const modifiedFiles = status.modified.filter((file) =>
			this.shouldIncludeFile(file),
		);
		const untrackedFiles = status.not_added.filter((file) =>
			this.shouldIncludeFile(file),
		);

		// Get diffs for filtered files
		let stagedDiff = "";
		let unstagedDiff = "";
		let untrackedDiff = "";

		// Get staged changes for filtered files
		if (stagedFiles.length > 0) {
			try {
				stagedDiff = await this.git.diff(["--cached"]);
			} catch (error: unknown) {
				console.warn("Error getting staged diff:", error);
			}
		}

		// Get unstaged changes for filtered files
		if (modifiedFiles.length > 0) {
			try {
				unstagedDiff = await this.git.diff();
			} catch (error) {
				console.warn("Error getting unstaged diff:", error);
			}
		}

		// For untracked files, show them as new files with full content
		for (const file of untrackedFiles) {
			try {
				const diff = await this.git.raw([
					"diff",
					"--no-index",
					"/dev/null",
					file,
				]);
				untrackedDiff += `${diff}\n`;
			} catch (error: unknown) {
				// git diff --no-index exits with code 1 when files differ, which is expected
				if (error instanceof Error && error.message) {
					untrackedDiff += `${error.message}\n`;
				}
			}
		}

		// Concatenate all diffs into a single patch
		let fullPatch = "";

		if (stagedDiff.trim()) {
			fullPatch += `# Staged changes\n${stagedDiff}\n`;
		}

		if (unstagedDiff.trim()) {
			fullPatch += `# Unstaged changes\n${unstagedDiff}\n`;
		}

		if (untrackedDiff.trim()) {
			fullPatch += `# Untracked files\n${untrackedDiff}\n`;
		}

		return fullPatch;
	}

	async getFileSpecificDiffs(
		base: string,
		head: string,
	): Promise<Map<string, string>> {
		const fileDiffs = new Map<string, string>();

		// Get list of changed files
		const changedFiles = await this.git.raw([
			"diff",
			"--name-only",
			base,
			head,
		]);

		const files = changedFiles.trim().split("\n").filter(Boolean);

		// Get diff for each file
		for (const file of files) {
			if (this.shouldIncludeFile(file)) {
				try {
					const diff = await this.git.raw(["diff", base, head, "--", file]);
					fileDiffs.set(file, diff);
				} catch (error) {
					console.warn(`Error getting diff for ${file}:`, error);
				}
			}
		}

		return fileDiffs;
	}

	public async getStatus() {
		return this.git.status();
	}

	public async getLog(options?: string[]) {
		return this.git.log(options);
	}
}
