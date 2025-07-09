import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { createSummarizerAgent } from "../agents/summarizer-agent";
import { createDocWriterAgent } from "../agents/doc-writer-agent";
import type { Tool } from "../agents/tool";
import { promptManager } from "../prompt-manager";
import { createIgnorePatternManager } from "../utils/ignore-patterns";
import { createSummaryStorage } from "../utils/summary-storage";

interface SummarizeAndDocumentArgs {
	path: string;
	maxDepth?: number;
	ignorePatterns?: string[];
	chunkSize?: number;
	apiKey: string;
	parallel?: boolean;
	maxConcurrency?: number;
	generateDocs?: boolean;
	docTypes?: Array<"readme" | "api" | "changelog">;
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

interface ModuleGroup {
	name: string;
	files: FileSummary[];
	summary: string;
	keyFunctions: string[];
	dependencies: string[];
	exports: string[];
}

interface CodebaseSummary {
	totalFiles: number;
	processedFiles: number;
	skippedFiles: number;
	fileSummaries: FileSummary[];
	overallStructure: string;
	keyComponents: string[];
	dependencies: string[];
	moduleGroups: Record<string, ModuleGroup>;
	timestamp: string;
	processingTime: number;
}

interface DocumentationResult {
	summary: CodebaseSummary;
	documentation?: Record<string, string>;
	success: boolean;
	error?: string;
}

const SUPPORTED_EXTENSIONS = [
	".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".cpp", ".c", ".cs", ".go", ".rs", ".rb", ".php"
];

class EnhancedCodebaseSummarizer {
	private summarizerAgent: any;
	private docWriterAgent: any;
	private fileChunker: FileChunker;
	private scanner: CodebaseFileScanner;
	private summaryStorage: any;

	constructor(
		apiKey: string,
		chunkSize: number,
		ignoreManager: any,
		maxDepth: number,
		summaryStorage: any,
	) {
		// Initialize prompt manager with default templates
		promptManager.loadDefaultTemplates();
		
		this.summarizerAgent = createSummarizerAgent(apiKey);
		this.docWriterAgent = createDocWriterAgent(apiKey);
		this.fileChunker = new FileChunker(chunkSize);
		this.scanner = new CodebaseFileScanner(ignoreManager, maxDepth);
		this.summaryStorage = summaryStorage;
	}

	async summarizeAndGenerateDocumentation(
		rootPath: string, 
		options?: { 
			parallel?: boolean; 
			maxConcurrency?: number;
			generateDocs?: boolean;
			docTypes?: Array<"readme" | "api" | "changelog">;
		}
	): Promise<DocumentationResult> {
		const startTime = Date.now();
		
		try {
			// Step 1: Summarize the codebase
			console.log("🔍 Analyzing codebase...");
			const summary = await this.summarizeCodebase(rootPath, options);
			
			// Step 2: Generate documentation if requested
			let documentation: Record<string, string> = {};
			if (options?.generateDocs) {
				console.log("📝 Generating documentation...");
				documentation = await this.generateDocumentationFromSummary(
					summary, 
					rootPath, 
					options.docTypes || ["readme"]
				);
			}
			
			const processingTime = Date.now() - startTime;
			summary.processingTime = processingTime;
			
			console.log(`✅ Completed in ${processingTime}ms`);
			
			return {
				summary,
				documentation,
				success: true
			};
		} catch (error) {
			return {
				summary: {} as CodebaseSummary,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async summarizeCodebase(
		rootPath: string, 
		options?: { 
			parallel?: boolean; 
			maxConcurrency?: number;
		}
	): Promise<CodebaseSummary> {
		const files = await this.scanner.scanFiles(rootPath);
		const fileSummaries: FileSummary[] = [];
		let processedFiles = 0;
		let skippedFiles = 0;

		console.log(`Found ${files.length} files to process`);

		// Process files in parallel by default
		if (options?.parallel !== false) {
			const maxConcurrency = options?.maxConcurrency || 5;
			const results = await this.processFilesInParallel(files, rootPath, maxConcurrency);
			
			for (const result of results) {
				if (result.success && result.summary) {
					fileSummaries.push(result.summary);
					processedFiles++;
				} else {
					skippedFiles++;
				}
			}
		} else {
			// Sequential processing (fallback)
			for (const filePath of files) {
				try {
					const result = await this.processFile(filePath, rootPath);
					if (result.success && result.summary) {
						fileSummaries.push(result.summary);
						processedFiles++;
					} else {
						skippedFiles++;
					}
				} catch (error) {
					console.warn(`Error processing file ${filePath}:`, error);
					skippedFiles++;
				}
			}
		}

		// Save cache after processing
		await this.summaryStorage.saveCache();

		const overallStructure = this.generateOverallStructure(fileSummaries);
		const keyComponents = this.extractKeyComponents(fileSummaries);
		const dependencies = this.extractDependencies(fileSummaries);
		const moduleGroups = this.groupByModules(fileSummaries);

		return {
			totalFiles: files.length,
			processedFiles,
			skippedFiles,
			fileSummaries,
			overallStructure,
			keyComponents,
			dependencies,
			moduleGroups,
			timestamp: new Date().toISOString(),
			processingTime: 0 // Will be set by caller
		};
	}

	private async processFilesInParallel(
		files: string[], 
		rootPath: string, 
		maxConcurrency: number
	): Promise<Array<{ success: boolean; summary?: FileSummary; error?: string }>> {
		const results: Array<{ success: boolean; summary?: FileSummary; error?: string }> = [];
		
		// Process files in chunks to limit concurrency
		for (let i = 0; i < files.length; i += maxConcurrency) {
			const chunk = files.slice(i, i + maxConcurrency);
			const chunkPromises = chunk.map(async (filePath) => {
				try {
					const result = await this.processFile(filePath, rootPath);
					return result;
				} catch (error) {
					console.warn(`Error processing file ${filePath}:`, error);
					return { 
						success: false, 
						error: error instanceof Error ? error.message : 'Unknown error' 
					};
				}
			});
			
			const chunkResults = await Promise.all(chunkPromises);
			results.push(...chunkResults);
			
			// Progress indicator
			console.log(`Processed ${Math.min(i + maxConcurrency, files.length)} / ${files.length} files`);
		}
		
		return results;
	}

	private async processFile(filePath: string, rootPath: string): Promise<{ success: boolean; summary?: FileSummary }> {
		// Check if we have a cached summary first
		const cached = await this.summaryStorage.getCachedSummary(filePath);
		if (cached) {
			return {
				success: true,
				summary: {
					filename: cached.relativePath.split("/").pop() || "",
					relativePath: cached.relativePath,
					summary: cached.summary,
					keyFunctions: cached.keyFunctions,
					dependencies: cached.dependencies,
					exportedSymbols: cached.exportedSymbols,
					chunkSummaries: cached.chunkSummaries,
				}
			};
		}

		const summary = await this.summarizeFile(filePath, rootPath);
		if (summary) {
			// Store the summary in cache
			await this.summaryStorage.storeSummary(filePath, {
				relativePath: summary.relativePath,
				summary: summary.summary,
				keyFunctions: summary.keyFunctions,
				dependencies: summary.dependencies,
				exportedSymbols: summary.exportedSymbols,
				chunkSummaries: summary.chunkSummaries,
				timestamp: new Date().toISOString()
			});
			
			return { success: true, summary };
		}
		
		return { success: false };
	}

	private async summarizeFile(filePath: string, rootPath: string): Promise<FileSummary | null> {
		const { content, chunks } = await this.fileChunker.chunkFile(filePath);
		
		if (!content) {
			return null;
		}

		const relativePath = relative(rootPath, filePath);
		const filename = relativePath.split("/").pop() || "";
		
		// Extract basic information
		const keyFunctions = this.extractFunctions(content);
		const dependencies = this.extractDependencies([{ dependencies: this.extractImports(content) } as any]);
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
				const endLine = Math.min((i + 1) * this.fileChunker.chunkSize, lines.length);
				
				const chunkSummary = await this.summarizeChunk(chunks[i], filename, relativePath);
				const chunkFunctions = this.extractFunctions(chunks[i]);
				
				chunkSummaries.push({
					startLine,
					endLine,
					summary: chunkSummary,
					functions: chunkFunctions
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
			chunkSummaries: chunkSummaries.length > 0 ? chunkSummaries : undefined
		};
	}

	private async generateDocumentationFromSummary(
		summary: CodebaseSummary, 
		rootPath: string, 
		docTypes: Array<"readme" | "api" | "changelog">
	): Promise<Record<string, string>> {
		const documentation: Record<string, string> = {};
		
		// Process each module group in parallel
		const modulePromises = Object.entries(summary.moduleGroups).map(async ([moduleName, moduleGroup]) => {
			const moduleDocs: Record<string, string> = {};
			
			// Generate documentation for each requested type
			for (const docType of docTypes) {
				try {
					const docContent = await this.generateModuleDocumentation(
						moduleGroup, 
						moduleName, 
						docType, 
						rootPath
					);
					moduleDocs[docType] = docContent;
				} catch (error) {
					console.warn(`Error generating ${docType} for module ${moduleName}:`, error);
					moduleDocs[docType] = `Error generating documentation: ${error}`;
				}
			}
			
			return { moduleName, moduleDocs };
		});
		
		const moduleResults = await Promise.all(modulePromises);
		
		// Combine all module documentation
		for (const { moduleName, moduleDocs } of moduleResults) {
			for (const [docType, content] of Object.entries(moduleDocs)) {
				documentation[`${moduleName}-${docType}`] = content;
			}
		}
		
		// Generate overall project documentation
		if (docTypes.includes("readme")) {
			documentation["project-readme"] = await this.generateProjectOverview(summary, rootPath);
		}
		
		return documentation;
	}

	private async generateModuleDocumentation(
		moduleGroup: ModuleGroup, 
		moduleName: string, 
		docType: "readme" | "api" | "changelog", 
		rootPath: string
	): Promise<string> {
		const moduleContext = {
			name: moduleName,
			files: moduleGroup.files,
			summary: moduleGroup.summary,
			keyFunctions: moduleGroup.keyFunctions,
			dependencies: moduleGroup.dependencies,
			exports: moduleGroup.exports
		};

		const existingDoc = await this.getExistingDocumentation(rootPath, docType);
		
		const docWriterInput = {
			codeSummary: moduleContext,
			existingDoc,
			docType,
			targetAudience: "developers",
			projectType: this.detectProjectType(rootPath)
		};

		const result = await this.docWriterAgent.updateDocumentation(docWriterInput);
		return result.updatedContent || "No documentation generated";
	}

	private async generateProjectOverview(summary: CodebaseSummary, rootPath: string): Promise<string> {
		const projectOverview = {
			totalFiles: summary.totalFiles,
			modules: Object.keys(summary.moduleGroups),
			keyComponents: summary.keyComponents,
			dependencies: summary.dependencies,
			structure: summary.overallStructure
		};

		const existingDoc = await this.getExistingDocumentation(rootPath, "readme");
		
		const docWriterInput = {
			codeSummary: projectOverview,
			existingDoc,
			docType: "readme",
			targetAudience: "developers",
			projectType: this.detectProjectType(rootPath)
		};

		const result = await this.docWriterAgent.updateDocumentation(docWriterInput);
		return result.updatedContent || "No overview generated";
	}

	private groupByModules(fileSummaries: FileSummary[]): Record<string, ModuleGroup> {
		const moduleGroups: Record<string, ModuleGroup> = {};
		
		for (const summary of fileSummaries) {
			const pathParts = summary.relativePath.split('/');
			const moduleName = pathParts.length > 1 ? pathParts[0] : 'root';
			
			if (!moduleGroups[moduleName]) {
				moduleGroups[moduleName] = {
					name: moduleName,
					files: [],
					summary: "",
					keyFunctions: [],
					dependencies: [],
					exports: []
				};
			}
			
			moduleGroups[moduleName].files.push(summary);
			moduleGroups[moduleName].keyFunctions.push(...summary.keyFunctions);
			moduleGroups[moduleName].dependencies.push(...summary.dependencies);
			moduleGroups[moduleName].exports.push(...summary.exportedSymbols);
		}
		
		// Generate module summaries
		for (const [moduleName, group] of Object.entries(moduleGroups)) {
			group.summary = `Module ${moduleName} contains ${group.files.length} files with ${group.keyFunctions.length} functions`;
			group.keyFunctions = [...new Set(group.keyFunctions)];
			group.dependencies = [...new Set(group.dependencies)];
			group.exports = [...new Set(group.exports)];
		}
		
		return moduleGroups;
	}

	// Helper methods (reused from original implementation)
	private async summarizeChunk(content: string, filename: string, relativePath: string): Promise<string> {
		try {
			const filePurpose = this.inferFilePurpose(filename, relativePath);
			const result = await this.summarizerAgent.summarizeChanges({
				filename,
				filePurpose,
				diffContent: content,
				existingDocContext: ""
			});
			
			return result.key_changes?.join(" ") || "No summary available";
		} catch (error) {
			console.warn(`Error summarizing chunk for ${filename}:`, error);
			return `File contains ${content.split("\n").length} lines of code`;
		}
	}

	private createOverallFileSummary(chunkSummaries: ChunkSummary[], filename: string): string {
		const summaries = chunkSummaries.map((chunk) => chunk.summary).join(" ");
		return `${filename} is structured across ${chunkSummaries.length} sections: ${summaries}`;
	}

	private extractFunctions(content: string): string[] {
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
				/from\s+['"]([^'"]+)['"]\s+import/g,
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
		if (filename === `index${ext}`) {
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
			filesByDir.get(dir)?.push(summary);
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
			if (summary.keyFunctions.length > 0) {
				components.push(...summary.keyFunctions.slice(0, 3));
			}
			if (summary.exportedSymbols.length > 0) {
				components.push(...summary.exportedSymbols.slice(0, 2));
			}
		}
		
		return [...new Set(components)].slice(0, 20);
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

	private async getExistingDocumentation(projectDir: string, docType: string): Promise<string> {
		const docFiles = {
			readme: "README.md",
			api: "API.md",
			changelog: "CHANGELOG.md"
		};

		const filename = docFiles[docType as keyof typeof docFiles] || "README.md";
		const filepath = join(projectDir, filename);

		try {
			return await fs.readFile(filepath, "utf-8");
		} catch {
			return `# ${this.getProjectName(projectDir)}\n\nThis documentation will be generated based on code analysis.`;
		}
	}

	private detectProjectType(projectDir: string): string {
		const packageJsonPath = join(projectDir, "package.json");
		
		try {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			if (packageJson.type === "module") return "ES Module";
			if (packageJson.bin) return "CLI Tool";
			if (packageJson.scripts?.start) return "Application";
			return "Node.js Library";
		} catch {
			return "Software Project";
		}
	}

	private getProjectName(projectDir: string): string {
		const packageJsonPath = join(projectDir, "package.json");
		
		try {
			const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			return packageJson.name || "Project";
		} catch {
			return projectDir.split("/").pop() || "Project";
		}
	}
}

// Reuse FileChunker and CodebaseFileScanner classes from original implementation
class FileChunker {
	public chunkSize: number;

	constructor(chunkSize = 100) {
		this.chunkSize = chunkSize;
	}

	async chunkFile(filePath: string): Promise<{ content: string; chunks: string[] }> {
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

class CodebaseFileScanner {
	private ignoreManager: any;
	private maxDepth: number;

	constructor(ignoreManager: any, maxDepth = 10) {
		this.ignoreManager = ignoreManager;
		this.maxDepth = maxDepth;
	}

	async scanFiles(rootPath: string): Promise<string[]> {
		const files: string[] = [];
		await this.scanDirectory(rootPath, 0, files);
		return files;
	}

	private async scanDirectory(dirPath: string, currentDepth: number, files: string[]): Promise<void> {
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

async function summarizeAndDocumentHandler(args: SummarizeAndDocumentArgs): Promise<DocumentationResult> {
	try {
		const targetPath = resolve(args.path);
		const maxDepth = args.maxDepth || 10;
		const chunkSize = args.chunkSize || 100;
		const parallel = args.parallel !== false;
		const maxConcurrency = args.maxConcurrency || 5;

		await fs.access(targetPath);
		const stats = await fs.stat(targetPath);

		if (!stats.isDirectory()) {
			return {
				summary: {} as CodebaseSummary,
				success: false,
				error: "Path is not a directory"
			};
		}

		// Initialize components
		const ignoreManager = await createIgnorePatternManager(targetPath);
		if (args.ignorePatterns) {
			for (const pattern of args.ignorePatterns) {
				ignoreManager.addPattern(pattern);
			}
		}

		const summaryStorage = await createSummaryStorage(targetPath);
		await summaryStorage.clearExpiredEntries();

		const summarizer = new EnhancedCodebaseSummarizer(
			args.apiKey,
			chunkSize,
			ignoreManager,
			maxDepth,
			summaryStorage
		);

		// Run the enhanced summarization and documentation process
		const result = await summarizer.summarizeAndGenerateDocumentation(targetPath, {
			parallel,
			maxConcurrency,
			generateDocs: args.generateDocs,
			docTypes: args.docTypes
		});

		return result;
	} catch (error) {
		return {
			summary: {} as CodebaseSummary,
			success: false,
			error: error instanceof Error ? error.message : "Unknown error"
		};
	}
}

export const enhancedSummarizeCodebaseTool: Tool<SummarizeAndDocumentArgs> = {
	name: "summarize_and_document_codebase",
	description: "Summarize a codebase in parallel and generate documentation using doc-writer-agent",
	parameters: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "The root directory path to analyze"
			},
			maxDepth: {
				type: "number",
				description: "Maximum directory depth to traverse (default: 10)"
			},
			ignorePatterns: {
				type: "array",
				items: { type: "string" },
				description: "Additional patterns to ignore (beyond default ignore patterns)"
			},
			chunkSize: {
				type: "number",
				description: "Number of lines per chunk for large files (default: 100)"
			},
			apiKey: {
				type: "string",
				description: "OpenAI API key for summarization and documentation"
			},
			parallel: {
				type: "boolean",
				description: "Enable parallel processing (default: true)"
			},
			maxConcurrency: {
				type: "number",
				description: "Maximum number of concurrent file processing (default: 5)"
			},
			generateDocs: {
				type: "boolean",
				description: "Generate documentation using doc-writer-agent (default: false)"
			},
			docTypes: {
				type: "array",
				items: { type: "string", enum: ["readme", "api", "changelog"] },
				description: "Types of documentation to generate (default: ['readme'])"
			}
		},
		required: ["path", "apiKey"]
	},
	handler: summarizeAndDocumentHandler
};