import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface StoredSummary {
	filePath: string;
	relativePath: string;
	contentHash: string;
	summary: string;
	keyFunctions: string[];
	dependencies: string[];
	exportedSymbols: string[];
	chunkSummaries?: ChunkSummary[];
	timestamp: string;
	lastModified: string;
}

export interface ChunkSummary {
	startLine: number;
	endLine: number;
	summary: string;
	functions: string[];
}

export interface SummaryCache {
	version: string;
	rootPath: string;
	summaries: { [filePath: string]: StoredSummary };
	metadata: {
		lastUpdated: string;
		totalFiles: number;
		cacheHits: number;
		cacheMisses: number;
	};
}

export class SummaryStorage {
	private cacheDir: string;
	private summaryFile: string;
	private cache: SummaryCache;
	private rootPath: string;

	constructor(rootPath: string) {
		this.rootPath = resolve(rootPath);
		this.cacheDir = join(this.rootPath, ".dockeeper_cache");
		this.summaryFile = join(this.cacheDir, "summaries.json");
		this.cache = this.createEmptyCache();
	}

	private createEmptyCache(): SummaryCache {
		return {
			version: "1.0.0",
			rootPath: this.rootPath,
			summaries: {},
			metadata: {
				lastUpdated: new Date().toISOString(),
				totalFiles: 0,
				cacheHits: 0,
				cacheMisses: 0,
			},
		};
	}

	async ensureCacheDirectory(): Promise<void> {
		try {
			await fs.mkdir(this.cacheDir, { recursive: true });
		} catch (error) {
			console.warn("Failed to create cache directory:", error);
		}
	}

	async loadCache(): Promise<void> {
		try {
			const content = await fs.readFile(this.summaryFile, "utf-8");
			this.cache = JSON.parse(content);

			// Validate cache structure
			if (
				!this.cache.version ||
				!this.cache.summaries ||
				!this.cache.metadata
			) {
				console.warn("Invalid cache structure, creating new cache");
				this.cache = this.createEmptyCache();
			}
		} catch (error) {
			// Cache file doesn't exist or is corrupted, start fresh
			this.cache = this.createEmptyCache();
		}
	}

	async saveCache(): Promise<void> {
		await this.ensureCacheDirectory();
		this.cache.metadata.lastUpdated = new Date().toISOString();

		try {
			await fs.writeFile(
				this.summaryFile,
				JSON.stringify(this.cache, null, 2),
				"utf-8",
			);
		} catch (error) {
			console.error("Failed to save cache:", error);
		}
	}

	async getCachedSummary(filePath: string): Promise<StoredSummary | null> {
		const absolutePath = resolve(filePath);
		const cached = this.cache.summaries[absolutePath];

		if (!cached) {
			this.cache.metadata.cacheMisses++;
			return null;
		}

		// Check if file has been modified since cache
		try {
			const stats = await fs.stat(absolutePath);
			const lastModified = stats.mtime.toISOString();

			if (cached.lastModified !== lastModified) {
				// File has been modified, cache is stale
				delete this.cache.summaries[absolutePath];
				this.cache.metadata.cacheMisses++;
				return null;
			}

			// Also check content hash for additional verification
			const content = await fs.readFile(absolutePath, "utf-8");
			const contentHash = this.calculateContentHash(content);

			if (cached.contentHash !== contentHash) {
				// Content has changed, cache is stale
				delete this.cache.summaries[absolutePath];
				this.cache.metadata.cacheMisses++;
				return null;
			}

			this.cache.metadata.cacheHits++;
			return cached;
		} catch (error) {
			// File doesn't exist anymore, remove from cache
			delete this.cache.summaries[absolutePath];
			this.cache.metadata.cacheMisses++;
			return null;
		}
	}

	async storeSummary(
		filePath: string,
		summary: Omit<StoredSummary, "filePath" | "contentHash" | "lastModified">,
	): Promise<void> {
		const absolutePath = resolve(filePath);

		try {
			const stats = await fs.stat(absolutePath);
			const content = await fs.readFile(absolutePath, "utf-8");

			const storedSummary: StoredSummary = {
				...summary,
				filePath: absolutePath,
				contentHash: this.calculateContentHash(content),
				lastModified: stats.mtime.toISOString(),
			};

			this.cache.summaries[absolutePath] = storedSummary;
			this.cache.metadata.totalFiles = Object.keys(this.cache.summaries).length;
		} catch (error) {
			console.warn(`Failed to store summary for ${filePath}:`, error);
		}
	}

	async isCacheValid(filePath: string): Promise<boolean> {
		const cached = await this.getCachedSummary(filePath);
		return cached !== null;
	}

	async clearCache(): Promise<void> {
		this.cache = this.createEmptyCache();
		await this.saveCache();
	}

	async clearExpiredEntries(
		maxAge: number = 7 * 24 * 60 * 60 * 1000,
	): Promise<void> {
		const now = Date.now();
		const expiredPaths: string[] = [];

		for (const [path, summary] of Object.entries(this.cache.summaries)) {
			const summaryTime = new Date(summary.timestamp).getTime();
			if (now - summaryTime > maxAge) {
				expiredPaths.push(path);
			}
		}

		for (const path of expiredPaths) {
			delete this.cache.summaries[path];
		}

		this.cache.metadata.totalFiles = Object.keys(this.cache.summaries).length;

		if (expiredPaths.length > 0) {
			console.log(`Cleared ${expiredPaths.length} expired cache entries`);
		}
	}

	getCacheStats(): {
		totalFiles: number;
		cacheHits: number;
		cacheMisses: number;
		hitRate: number;
		lastUpdated: string;
	} {
		const { totalFiles, cacheHits, cacheMisses, lastUpdated } =
			this.cache.metadata;
		const hitRate =
			cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0;

		return {
			totalFiles,
			cacheHits,
			cacheMisses,
			hitRate,
			lastUpdated,
		};
	}

	async getAllSummaries(): Promise<StoredSummary[]> {
		return Object.values(this.cache.summaries);
	}

	async getSummariesByPattern(pattern: RegExp): Promise<StoredSummary[]> {
		return Object.values(this.cache.summaries).filter((summary) =>
			pattern.test(summary.relativePath),
		);
	}

	private calculateContentHash(content: string): string {
		return createHash("sha256").update(content).digest("hex");
	}

	async exportCache(exportPath: string): Promise<void> {
		await fs.writeFile(
			exportPath,
			JSON.stringify(this.cache, null, 2),
			"utf-8",
		);
	}

	async importCache(importPath: string): Promise<void> {
		const content = await fs.readFile(importPath, "utf-8");
		const importedCache = JSON.parse(content);

		// Validate imported cache
		if (
			importedCache.version &&
			importedCache.summaries &&
			importedCache.metadata
		) {
			this.cache = importedCache;
			await this.saveCache();
		} else {
			throw new Error("Invalid cache format");
		}
	}
}

export async function createSummaryStorage(
	rootPath: string,
): Promise<SummaryStorage> {
	const storage = new SummaryStorage(rootPath);
	await storage.loadCache();
	return storage;
}
