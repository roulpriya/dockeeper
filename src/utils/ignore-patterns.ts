import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";

export class IgnorePatternManager {
	private patterns: string[] = [];
	private rootPath: string;

	constructor(rootPath: string) {
		this.rootPath = resolve(rootPath);
	}

	async loadIgnorePatterns(): Promise<void> {
		// Load .dockeeperignore file
		const ignoreFile = join(this.rootPath, ".dockeeperignore");

		try {
			const content = await fs.readFile(ignoreFile, "utf-8");
			const patterns = content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#")); // Remove comments and empty lines

			this.patterns = patterns;
		} catch (error) {
			// .dockeeperignore file doesn't exist, use default patterns
			this.patterns = this.getDefaultPatterns();
		}
	}

	private getDefaultPatterns(): string[] {
		return [
			"node_modules",
			".git",
			"dist",
			"build",
			"coverage",
			".next",
			".nuxt",
			".cache",
			"__pycache__",
			".pytest_cache",
			".venv",
			"venv",
			".DS_Store",
			"*.min.js",
			"*.min.css",
			"*.map",
			".dockeeper_cache",
			"*.log",
			"*.tmp",
			"*.temp",
			".env",
			".env.local",
			".env.production",
			".env.development",
			"*.lock",
			"yarn.lock",
			"package-lock.json",
			"Pipfile.lock",
			"poetry.lock",
		];
	}

	shouldIgnore(path: string): boolean {
		const relativePath = path.replace(this.rootPath, "").replace(/^[\/\\]/, "");

		return this.patterns.some((pattern) => {
			if (pattern.includes("*")) {
				// Convert glob pattern to regex
				const regex = new RegExp(
					pattern
						.replace(/\./g, "\\.")
						.replace(/\*/g, ".*")
						.replace(/\?/g, "."),
				);
				return regex.test(relativePath);
			} else {
				// Simple string matching
				return (
					relativePath.includes(pattern) || relativePath.startsWith(pattern)
				);
			}
		});
	}

	getPatterns(): string[] {
		return [...this.patterns];
	}

	addPattern(pattern: string): void {
		if (!this.patterns.includes(pattern)) {
			this.patterns.push(pattern);
		}
	}

	removePattern(pattern: string): void {
		this.patterns = this.patterns.filter((p) => p !== pattern);
	}

	async saveIgnoreFile(): Promise<void> {
		const ignoreFile = join(this.rootPath, ".dockeeperignore");
		const content = this.patterns.join("\n");
		await fs.writeFile(ignoreFile, content, "utf-8");
	}
}

export async function createIgnorePatternManager(
	rootPath: string,
): Promise<IgnorePatternManager> {
	const manager = new IgnorePatternManager(rootPath);
	await manager.loadIgnorePatterns();
	return manager;
}
