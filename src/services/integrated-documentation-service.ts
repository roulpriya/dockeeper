import { enhancedSummarizeCodebaseTool } from "../tools/summarize-codebase-tool-enhanced";
import { createDocumentationService } from "../documentation-service";

export interface IntegratedDocumentationOptions {
	codebasePath: string;
	apiKey: string;
	parallel?: boolean;
	maxConcurrency?: number;
	chunkSize?: number;
	maxDepth?: number;
	ignorePatterns?: string[];
	docTypes?: Array<"readme" | "api" | "changelog">;
	targetAudience?: "developers" | "users" | "contributors";
	outputDir?: string;
}

export interface IntegratedDocumentationResult {
	summary: {
		totalFiles: number;
		processedFiles: number;
		moduleGroups: Record<string, any>;
		processingTime: number;
	};
	documentation: Record<string, string>;
	files: Array<{
		path: string;
		content: string;
		docType: string;
	}>;
	success: boolean;
	error?: string;
}

export class IntegratedDocumentationService {
	private apiKey: string;
	private documentationService: any;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
		this.documentationService = createDocumentationService(apiKey);
	}

	/**
	 * Complete workflow: Summarize codebase in parallel, then generate documentation
	 * for each module using doc-writer-agent
	 */
	async processCodebaseAndGenerateDocumentation(
		options: IntegratedDocumentationOptions
	): Promise<IntegratedDocumentationResult> {
		console.log("🚀 Starting integrated documentation workflow...");
		
		try {
			// Step 1: Parallel codebase summarization
			console.log("📊 Step 1: Analyzing codebase in parallel...");
			const summarizationResult = await enhancedSummarizeCodebaseTool.handler({
				path: options.codebasePath,
				apiKey: options.apiKey,
				parallel: options.parallel !== false,
				maxConcurrency: options.maxConcurrency || 5,
				chunkSize: options.chunkSize || 100,
				maxDepth: options.maxDepth || 10,
				ignorePatterns: options.ignorePatterns || [],
				generateDocs: true,
				docTypes: options.docTypes || ["readme", "api"]
			});

			if (!summarizationResult.success) {
				return {
					summary: {
						totalFiles: 0,
						processedFiles: 0,
						moduleGroups: {},
						processingTime: 0
					},
					documentation: {},
					files: [],
					success: false,
					error: summarizationResult.error
				};
			}

			console.log(`✅ Analyzed ${summarizationResult.summary.processedFiles} files in ${summarizationResult.summary.processingTime}ms`);

			// Step 2: Generate enhanced documentation for each module
			console.log("📝 Step 2: Generating module documentation...");
			const moduleDocumentation = await this.generateModuleDocumentation(
				summarizationResult.summary.moduleGroups,
				options
			);

			// Step 3: Generate project-level documentation
			console.log("📄 Step 3: Generating project documentation...");
			const projectDocumentation = await this.generateProjectDocumentation(
				summarizationResult.summary,
				options
			);

			// Combine all documentation
			const allDocumentation = {
				...moduleDocumentation,
				...projectDocumentation
			};

			// Step 4: Create file structure for output
			const files = this.createDocumentationFiles(allDocumentation, options);

			console.log(`✅ Generated documentation for ${Object.keys(allDocumentation).length} sections`);

			return {
				summary: {
					totalFiles: summarizationResult.summary.totalFiles,
					processedFiles: summarizationResult.summary.processedFiles,
					moduleGroups: summarizationResult.summary.moduleGroups,
					processingTime: summarizationResult.summary.processingTime
				},
				documentation: allDocumentation,
				files,
				success: true
			};

		} catch (error) {
			console.error("❌ Integrated documentation workflow failed:", error);
			return {
				summary: {
					totalFiles: 0,
					processedFiles: 0,
					moduleGroups: {},
					processingTime: 0
				},
				documentation: {},
				files: [],
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Generate documentation for each module in parallel
	 */
	private async generateModuleDocumentation(
		moduleGroups: Record<string, any>,
		options: IntegratedDocumentationOptions
	): Promise<Record<string, string>> {
		const documentation: Record<string, string> = {};
		const docTypes = options.docTypes || ["readme"];

		// Process all modules in parallel
		const modulePromises = Object.entries(moduleGroups).map(async ([moduleName, moduleGroup]) => {
			const moduleDocs: Record<string, string> = {};

			// Generate each document type for this module
			for (const docType of docTypes) {
				try {
					const docKey = `${moduleName}-${docType}`;
					console.log(`  📝 Generating ${docType} for ${moduleName}...`);

					// Create a comprehensive summary for this module
					const moduleSummary = {
						change_type: "enhancement",
						filename: `${moduleName}/index.ts`,
						file_purpose: `${moduleName} module`,
						key_changes: moduleGroup.files.map((f: any) => f.summary),
						impact_areas: ["readme", "api", "usage"],
						new_dependencies: moduleGroup.dependencies,
						breaking_changes: [],
						documentation_recommendations: {
							readme: `Update ${moduleName} module documentation`,
							api_docs: `Document ${moduleName} API`,
							changelog: `Added ${moduleName} module functionality`
						},
						moduleDetails: {
							files: moduleGroup.files.map((f: any) => ({
								name: f.filename,
								path: f.relativePath,
								functions: f.keyFunctions,
								exports: f.exportedSymbols,
								summary: f.summary
							})),
							totalFunctions: moduleGroup.keyFunctions.length,
							totalExports: moduleGroup.exports.length,
							dependencies: moduleGroup.dependencies
						}
					};

					// Use documentation service to generate content
					const result = await this.documentationService.updateDocumentation({
						filename: `${moduleName}/index.ts`,
						filePurpose: `${moduleName} module`,
						diffContent: JSON.stringify(moduleSummary, null, 2),
						projectDir: options.codebasePath,
						docType: docType as any,
						targetAudience: options.targetAudience || "developers"
					});

					if (result.success) {
						moduleDocs[docKey] = result.documentation.updatedContent;
					} else {
						console.warn(`⚠️  Failed to generate ${docType} for ${moduleName}: ${result.error}`);
						moduleDocs[docKey] = `# ${moduleName} ${docType.toUpperCase()}\n\nDocumentation generation failed: ${result.error}`;
					}

				} catch (error) {
					console.warn(`⚠️  Error generating ${docType} for ${moduleName}:`, error);
					moduleDocs[docKey] = `# ${moduleName} ${docType.toUpperCase()}\n\nError: ${error}`;
				}
			}

			return moduleDocs;
		});

		// Wait for all modules to complete
		const moduleResults = await Promise.all(modulePromises);

		// Combine all results
		for (const moduleDocs of moduleResults) {
			Object.assign(documentation, moduleDocs);
		}

		return documentation;
	}

	/**
	 * Generate project-level documentation
	 */
	private async generateProjectDocumentation(
		summary: any,
		options: IntegratedDocumentationOptions
	): Promise<Record<string, string>> {
		const documentation: Record<string, string> = {};
		const docTypes = options.docTypes || ["readme"];

		for (const docType of docTypes) {
			try {
				console.log(`  📄 Generating project-level ${docType}...`);

				// Create project overview
				const projectSummary = {
					change_type: "enhancement",
					filename: "PROJECT_OVERVIEW",
					file_purpose: "Project documentation",
					key_changes: [
						`Project contains ${summary.totalFiles} source files`,
						`Organized into ${Object.keys(summary.moduleGroups).length} modules`,
						`Total of ${summary.keyComponents.length} key components identified`
					],
					impact_areas: ["readme", "api", "usage", "architecture"],
					new_dependencies: summary.dependencies,
					breaking_changes: [],
					documentation_recommendations: {
						readme: "Complete project overview with architecture and usage",
						api_docs: "Comprehensive API documentation",
						changelog: "Project structure and feature overview"
					},
					projectDetails: {
						totalFiles: summary.totalFiles,
						processedFiles: summary.processedFiles,
						modules: Object.keys(summary.moduleGroups),
						structure: summary.overallStructure,
						keyComponents: summary.keyComponents.slice(0, 20),
						dependencies: summary.dependencies,
						processingTime: summary.processingTime
					}
				};

				const result = await this.documentationService.updateDocumentation({
					filename: "PROJECT_OVERVIEW",
					filePurpose: "Project documentation",
					diffContent: JSON.stringify(projectSummary, null, 2),
					projectDir: options.codebasePath,
					docType: docType as any,
					targetAudience: options.targetAudience || "developers"
				});

				if (result.success) {
					documentation[`project-${docType}`] = result.documentation.updatedContent;
				} else {
					console.warn(`⚠️  Failed to generate project ${docType}: ${result.error}`);
					documentation[`project-${docType}`] = `# Project ${docType.toUpperCase()}\n\nDocumentation generation failed: ${result.error}`;
				}

			} catch (error) {
				console.warn(`⚠️  Error generating project ${docType}:`, error);
				documentation[`project-${docType}`] = `# Project ${docType.toUpperCase()}\n\nError: ${error}`;
			}
		}

		return documentation;
	}

	/**
	 * Create file structure for documentation output
	 */
	private createDocumentationFiles(
		documentation: Record<string, string>,
		options: IntegratedDocumentationOptions
	): Array<{ path: string; content: string; docType: string }> {
		const files: Array<{ path: string; content: string; docType: string }> = [];
		const outputDir = options.outputDir || "docs";

		for (const [key, content] of Object.entries(documentation)) {
			const [module, docType] = key.split("-");
			const filename = this.getDocumentationFilename(docType);
			
			let filePath: string;
			if (module === "project") {
				filePath = `${outputDir}/${filename}`;
			} else {
				filePath = `${outputDir}/${module}/${filename}`;
			}

			files.push({
				path: filePath,
				content,
				docType
			});
		}

		return files;
	}

	private getDocumentationFilename(docType: string): string {
		const filenames = {
			readme: "README.md",
			api: "API.md",
			changelog: "CHANGELOG.md"
		};

		return filenames[docType as keyof typeof filenames] || "README.md";
	}

	/**
	 * Write documentation files to disk
	 */
	async writeDocumentationFiles(
		files: Array<{ path: string; content: string; docType: string }>,
		baseDir: string = "."
	): Promise<void> {
		const { promises: fs } = await import("node:fs");
		const { join, dirname } = await import("node:path");

		for (const file of files) {
			const fullPath = join(baseDir, file.path);
			const dir = dirname(fullPath);
			
			// Ensure directory exists
			await fs.mkdir(dir, { recursive: true });
			
			// Write file
			await fs.writeFile(fullPath, file.content, "utf-8");
			console.log(`📄 Created: ${file.path}`);
		}
	}
}

export function createIntegratedDocumentationService(apiKey: string): IntegratedDocumentationService {
	return new IntegratedDocumentationService(apiKey);
}