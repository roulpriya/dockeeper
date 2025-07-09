import { promises as fs } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { createSummarizerAgent } from "../agents/summarizer-agent";
import type { Tool } from "../agents/tool";
import { promptManager } from "../prompt-manager";
import { createIgnorePatternManager, type IgnorePatternManager } from "../utils/ignore-patterns";
import { createSummaryStorage, type SummaryStorage } from "../utils/summary-storage";
import type { SummarizerAgent } from "../agents/summarizer-agent";

interface SummarizeCodebaseArgs {
	path: string;
	maxDepth?: number;
	ignorePatterns?: string[];
	chunkSize?: number;
	apiKey: string;
}

interface FileSummary {
	filename: string;
	relativePath: string;
	summary: string;
	keyFunctions: string[];
	dependencies: string[];
	exportedSymbols: string[];
	chunkSummaries?: ChunkSummary[];
}

interface ChunkSummary {
	startLine: number;
	endLine: number;
	summary: string;
	functions: string[];
}

interface CodebaseSummary {
	totalFiles: number;
	processedFiles: number;
	skippedFiles: number;
	fileSummaries: FileSummary[];
	overallStructure: string;
	keyComponents: string[];
	dependencies: string[];
	moduleGroups?: Record<string, FileSummary[]>;
	timestamp: string;
}

const SUPPORTED_EXTENSIONS = [
	".ts",
	".js",
	".tsx",
	".jsx",
	".py",
	".java",
	".cpp",
	".c",
	".cs",
	".go",
	".rs",
	".rb",
	".php",
];

const DEFAULT_IGNORE_PATTERNS = [
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
];

class CodebaseFileScanner {
	private ignoreManager: IgnorePatternManager;
	private maxDepth: number;

	constructor(ignoreManager: IgnorePatternManager, maxDepth = 10) {
		this.ignoreManager = ignoreManager;
		this.maxDepth = maxDepth;
	}

	async scanFiles(rootPath: string): Promise<string[]> {
		const files: string[] = [];
		await this.scanDirectory(rootPath, 0, files);
		return files;
	}

	private async scanDirectory(
		dirPath: string,
		currentDepth: number,
		files: string[],
	): Promise<void> {
		if (currentDepth >= this.maxDepth) {
			return;
		}

		try {
			const items = await fs.readdir(dirPath);

			for (const item of items) {
				const fullPath = join(dirPath, item);

				if (this.ignoreManager.shouldIgnore(fullPath)) {
					continue;
				}

				const stats = await fs.stat(fullPath);

				if (stats.isDirectory()) {
					await this.scanDirectory(fullPath, currentDepth + 1, files);
				} else if (stats.isFile() && this.isSupportedFile(item)) {
					files.push(fullPath);
				}
			}
		} catch (error) {
			console.warn(`Error scanning directory ${dirPath}:`, error);
		}
	}

	private isSupportedFile(filename: string): boolean {
		const ext = extname(filename).toLowerCase();
		return SUPPORTED_EXTENSIONS.includes(ext);
	}
}

class FileChunker {
	public chunkSize: number;

	constructor(chunkSize = 100) {
		this.chunkSize = chunkSize;
	}

	async chunkFile(
		filePath: string,
	): Promise<{ content: string; chunks: string[] }> {
		try {
			const content = await fs.readFile(filePath, "utf-8");
			const lines = content.split("\n");

			if (lines.length <= this.chunkSize) {
				return { content, chunks: [content] };
			}

			const chunks: string[] = [];
			for (let i = 0; i < lines.length; i += this.chunkSize) {
				const chunk = lines.slice(i, i + this.chunkSize).join("\n");
				chunks.push(chunk);
			}

			return { content, chunks };
		} catch (error) {
			console.warn(`Error chunking file ${filePath}:`, error);
			return { content: "", chunks: [] };
		}
	}
}

class CodebaseSummarizer {
	private summarizerAgent: SummarizerAgent;
	private fileChunker: FileChunker;
	private scanner: CodebaseFileScanner;
	private summaryStorage: SummaryStorage;

	constructor(
		apiKey: string,
		chunkSize: number,
		ignoreManager: IgnorePatternManager,
		maxDepth: number,
		summaryStorage: SummaryStorage,
	) {
		// Initialize prompt manager with default templates
		promptManager.loadDefaultTemplates();

		this.summarizerAgent = createSummarizerAgent(apiKey);
		this.fileChunker = new FileChunker(chunkSize);
		this.scanner = new CodebaseFileScanner(ignoreManager, maxDepth);
		this.summaryStorage = summaryStorage;
	}

	async summarizeCodebase(rootPath: string): Promise<CodebaseSummary> {
		const files = await this.scanner.scanFiles(rootPath);
		const fileSummaries: FileSummary[] = [];
		let processedFiles = 0;
		let skippedFiles = 0;

		console.log(`Found ${files.length} files to process`);

		for (const filePath of files) {
			try {
				// Check if we have a cached summary first
				const cached = await this.summaryStorage.getCachedSummary(filePath);
				if (cached) {
					fileSummaries.push({
						filename: cached.relativePath.split("/").pop() || "",
						relativePath: cached.relativePath,
						summary: cached.summary,
						keyFunctions: cached.keyFunctions,
						dependencies: cached.dependencies,
						exportedSymbols: cached.exportedSymbols,
						chunkSummaries: cached.chunkSummaries,
					});
					processedFiles++;
					continue;
				}

				const summary = await this.summarizeFile(filePath, rootPath);
				if (summary) {
					fileSummaries.push(summary);
					processedFiles++;

					// Store the summary in cache
					await this.summaryStorage.storeSummary(filePath, {
						relativePath: summary.relativePath,
						summary: summary.summary,
						keyFunctions: summary.keyFunctions,
						dependencies: summary.dependencies,
						exportedSymbols: summary.exportedSymbols,
						chunkSummaries: summary.chunkSummaries,
						timestamp: new Date().toISOString(),
					});
				} else {
					skippedFiles++;
				}
			} catch (error) {
				console.warn(`Error processing file ${filePath}:`, error);
				skippedFiles++;
			}
		}

		// Save cache after processing
		await this.summaryStorage.saveCache();

		const overallStructure = this.generateOverallStructure(fileSummaries);
		const keyComponents = this.extractKeyComponents(fileSummaries);
		const dependencies = this.extractDependencies(fileSummaries);

		return {
			totalFiles: files.length,
			processedFiles,
			skippedFiles,
			fileSummaries,
			overallStructure,
			keyComponents,
			dependencies,
			timestamp: new Date().toISOString(),
		};
	}

	private async summarizeFile(
		filePath: string,
		rootPath: string,
	): Promise<FileSummary | null> {
		const { content, chunks } = await this.fileChunker.chunkFile(filePath);

		if (!content) {
			return null;
		}

		const relativePath = relative(rootPath, filePath);
		const filename = relativePath.split("/").pop() || "";

		// Extract basic information
		const keyFunctions = this.extractFunctions(content);
		const dependencies = this.extractDependencies([
			{ dependencies: this.extractImports(content) } as any,
		]);
		const exportedSymbols = this.extractExports(content);

		let summary: string;
		const chunkSummaries: ChunkSummary[] = [];

		if (chunks.length === 1) {
			// Single chunk - summarize the entire file
			summary = await this.summarizeChunk(content, filename, relativePath);
		} else {
			// Multiple chunks - summarize each chunk and then create overall summary
			const lines = content.split("\n");
			for (let i = 0; i < chunks.length; i++) {
				const startLine = i * this.fileChunker.chunkSize + 1;
				const endLine = Math.min(
					(i + 1) * this.fileChunker.chunkSize,
					lines.length,
				);

				const chunkSummary = await this.summarizeChunk(
					chunks[i],
					filename,
					relativePath,
				);
				const chunkFunctions = this.extractFunctions(chunks[i]);

				chunkSummaries.push({
					startLine,
					endLine,
					summary: chunkSummary,
					functions: chunkFunctions,
				});
			}

			// Create overall summary from chunk summaries
			summary = this.createOverallFileSummary(chunkSummaries, filename);
		}

		return {
			filename,
			relativePath,
			summary,
			keyFunctions,
			dependencies,
			exportedSymbols,
			chunkSummaries: chunkSummaries.length > 0 ? chunkSummaries : undefined,
		};
	}

	private async summarizeChunk(
		content: string,
		filename: string,
		relativePath: string,
	): Promise<string> {
		try {
			const filePurpose = this.inferFilePurpose(filename, relativePath);
			const result = await this.summarizerAgent.summarizeChanges({
				filename,
				filePurpose,
				diffContent: content,
				existingDocContext: "",
			});

			return result.key_changes?.join(" ") || "No summary available";
		} catch (error) {
			console.warn(`Error summarizing chunk for ${filename}:`, error);
			return `File contains ${content.split("\n").length} lines of code`;
		}
	}

	private createOverallFileSummary(
		chunkSummaries: ChunkSummary[],
		filename: string,
	): string {
		const summaries = chunkSummaries.map((chunk) => chunk.summary).join(" ");
		return `${filename} is structured across ${chunkSummaries.length} sections: ${summaries}`;
	}

	private extractFunctions(content: string): string[] {
		try {
			return this.extractFunctionsWithAST(content);
		} catch (error) {
			console.warn('AST parsing failed, falling back to regex extraction:', error);
			return this.extractFunctionsWithRegex(content);
		}
	}

	private extractFunctionsWithAST(content: string): string[] {
		const { parse } = require('@babel/parser');
		const traverse = require('@babel/traverse').default;
		const functions: string[] = [];

		const ast = parse(content, {
			sourceType: 'module',
			allowImportExportEverywhere: true,
			allowReturnOutsideFunction: true,
			plugins: [
				'typescript',
				'jsx',
				'decorators-legacy',
				'classProperties',
				'objectRestSpread',
				'functionBind',
				'exportDefaultFrom',
				'exportNamespaceFrom',
				'dynamicImport',
				'nullishCoalescingOperator',
				'optionalChaining',
				'asyncGenerators',
				'functionSent',
				'throwExpressions',
				'optionalCatchBinding',
				'partialApplication',
				'topLevelAwait'
			]
		});

		traverse(ast, {
			FunctionDeclaration(path: any) {
				if (path.node.id?.name) {
					functions.push(path.node.id.name);
				}
			},
			FunctionExpression(path: any) {
				if (path.node.id?.name) {
					functions.push(path.node.id.name);
				}
			},
			ArrowFunctionExpression(path: any) {
				if (path.parent.type === 'VariableDeclarator' && path.parent.id?.name) {
					functions.push(path.parent.id.name);
				} else if (path.parent.type === 'AssignmentExpression' && path.parent.left?.name) {
					functions.push(path.parent.left.name);
				}
			},
			VariableDeclarator(path: any) {
				if (path.node.id?.name && path.node.init) {
					if (path.node.init.type === 'FunctionExpression' || 
						path.node.init.type === 'ArrowFunctionExpression') {
						functions.push(path.node.id.name);
					}
				}
			},
			MethodDefinition(path: any) {
				if (path.node.key?.name) {
					functions.push(path.node.key.name);
				}
			},
			ObjectMethod(path: any) {
				if (path.node.key?.name) {
					functions.push(path.node.key.name);
				}
			},
			ClassMethod(path: any) {
				if (path.node.key?.name) {
					functions.push(path.node.key.name);
				}
			}
		});

		return [...new Set(functions)];
	}

	private extractFunctionsWithRegex(content: string): string[] {
		const functions: string[] = [];
		const lines = content.split("\n");

		for (const line of lines) {
			const patterns = [
				/function\s+(\w+)/g,
				/const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\([^)]*\)\s*:\s*[^=]+=)/g,
				/(\w+)\s*\([^)]*\)\s*{/g,
				/def\s+(\w+)/g,
				/public\s+\w+\s+(\w+)\s*\(/g,
			];

			for (const pattern of patterns) {
				const matches = [...line.matchAll(pattern)];
				for (const match of matches) {
					if (match[1] && !functions.includes(match[1])) {
						functions.push(match[1]);
					}
				}
			}
		}

		return functions;
	}

	private extractImports(content: string): string[] {
		const imports: string[] = [];
		const lines = content.split("\n");

		for (const line of lines) {
			const patterns = [
				/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
				/import\s+['"]([^'"]+)['"]/g,
				/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
				/from\s+['"]([^'"]+)['"]\s+import/g, // Python
			];

			for (const pattern of patterns) {
				const matches = [...line.matchAll(pattern)];
				for (const match of matches) {
					if (match[1] && !imports.includes(match[1])) {
						imports.push(match[1]);
					}
				}
			}
		}

		return imports;
	}

	private extractExports(content: string): string[] {
		const exports: string[] = [];
		const lines = content.split("\n");

		for (const line of lines) {
			const patterns = [
				/export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g,
				/export\s*{\s*([^}]+)\s*}/g,
				/module\.exports\s*=\s*(\w+)/g,
			];

			for (const pattern of patterns) {
				const matches = [...line.matchAll(pattern)];
				for (const match of matches) {
					if (match[1]) {
						if (match[1].includes(",")) {
							const items = match[1].split(",").map((item) => item.trim());
							exports.push(...items);
						} else {
							exports.push(match[1]);
						}
					}
				}
			}
		}

		return exports;
	}

	private inferFilePurpose(filename: string, relativePath: string): string {
		const ext = extname(filename).toLowerCase();
		const baseName = filename.replace(ext, "");
		const pathParts = relativePath.split("/");

		// Check for common patterns
		if (baseName.includes("test") || baseName.includes("spec")) {
			return "test file";
		}
		if (baseName.includes("config") || baseName.includes("settings")) {
			return "configuration file";
		}
		if (baseName.includes("util") || baseName.includes("helper")) {
			return "utility/helper file";
		}
		if (pathParts.includes("components") || pathParts.includes("component")) {
			return "UI component";
		}
		if (pathParts.includes("services") || pathParts.includes("service")) {
			return "service module";
		}
		if (pathParts.includes("models") || pathParts.includes("model")) {
			return "data model";
		}
		if (filename === "index" + ext) {
			return "module index/entry point";
		}

		return "source file";
	}

	private generateOverallStructure(fileSummaries: FileSummary[]): string {
		const directories = new Set<string>();
		const filesByDir = new Map<string, FileSummary[]>();

		for (const summary of fileSummaries) {
			const dir = summary.relativePath.includes("/")
				? summary.relativePath.split("/").slice(0, -1).join("/")
				: ".";

			directories.add(dir);
			if (!filesByDir.has(dir)) {
				filesByDir.set(dir, []);
			}
			filesByDir.get(dir)!.push(summary);
		}

		let structure = "Codebase structure:\n";
		for (const dir of Array.from(directories).sort()) {
			const files = filesByDir.get(dir) || [];
			structure += `- ${dir}/: ${files.length} files\n`;
		}

		return structure;
	}

	private extractKeyComponents(fileSummaries: FileSummary[]): string[] {
		const components: string[] = [];

		for (const summary of fileSummaries) {
			// Extract key components from summaries
			if (summary.keyFunctions.length > 0) {
				components.push(...summary.keyFunctions.slice(0, 3)); // Top 3 functions
			}
			if (summary.exportedSymbols.length > 0) {
				components.push(...summary.exportedSymbols.slice(0, 2)); // Top 2 exports
			}
		}

		return [...new Set(components)].slice(0, 20); // Dedupe and limit
	}

	private extractDependencies(fileSummaries: FileSummary[]): string[] {
		const deps = new Set<string>();

		for (const summary of fileSummaries) {
			for (const dep of summary.dependencies) {
				if (!dep.startsWith(".") && !dep.startsWith("/")) {
					deps.add(dep);
				}
			}
		}

		return Array.from(deps);
	}
}

async function summarizeCodebaseHandler(args: SummarizeCodebaseArgs): Promise<{
	summary: CodebaseSummary;
	success: boolean;
	error?: string;
}> {
	try {
		const targetPath = resolve(args.path);
		const maxDepth = args.maxDepth || 10;
		const chunkSize = args.chunkSize || 100;

		await fs.access(targetPath);
		const stats = await fs.stat(targetPath);

		if (!stats.isDirectory()) {
			return {
				summary: {} as CodebaseSummary,
				success: false,
				error: "Path is not a directory",
			};
		}

		// Initialize ignore patterns manager
		const ignoreManager = await createIgnorePatternManager(targetPath);

		// Add any additional ignore patterns
		if (args.ignorePatterns) {
			for (const pattern of args.ignorePatterns) {
				ignoreManager.addPattern(pattern);
			}
		}

		// Initialize summary storage
		const summaryStorage = await createSummaryStorage(targetPath);

		// Clean up expired cache entries
		await summaryStorage.clearExpiredEntries();

		const summarizer = new CodebaseSummarizer(
			args.apiKey,
			chunkSize,
			ignoreManager,
			maxDepth,
			summaryStorage,
		);
		const summary = await summarizer.summarizeCodebase(targetPath);

		return {
			summary,
			success: true,
		};
	} catch (error) {
		return {
			summary: {} as CodebaseSummary,
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export const summarizeCodebaseTool: Tool<SummarizeCodebaseArgs> = {
	name: "summarize_codebase",
	description:
		"Summarize a codebase by analyzing and summarizing all source files",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "The root directory path to analyze",
			},
			maxDepth: {
				type: "number",
				description: "Maximum directory depth to traverse (default: 10)",
			},
			ignorePatterns: {
				type: "array",
				items: { type: "string" },
				description:
					"Additional patterns to ignore (beyond default ignore patterns)",
			},
			chunkSize: {
				type: "number",
				description: "Number of lines per chunk for large files (default: 100)",
			},
			apiKey: {
				type: "string",
				description: "OpenAI API key for summarization",
			},
		},
		required: ["path", "apiKey"],
	},
	handler: summarizeCodebaseHandler,
};
