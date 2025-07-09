import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type DocWriterAgent,
	type DocWriterInput,
	createDocWriterAgent,
} from "./agents/doc-writer-agent";
import {
	type CodeSummaryInput,
	type SummarizerAgent,
	createSummarizerAgent,
} from "./agents/summarizer-agent";
import { promptManager } from "./prompt-manager";

export interface DocumentationUpdateRequest {
	filename: string;
	filePurpose: string;
	diffContent: string;
	projectDir: string;
	docType?: "readme" | "api" | "changelog" | "contributing";
	targetAudience?: "developers" | "users" | "contributors";
	summarizerTemplate?: string;
	docWriterTemplate?: string;
}

export interface DocumentationUpdateResult {
	summary: any;
	documentation: any;
	success: boolean;
	error?: string;
}

export class DocumentationService {
	private summarizerAgent: SummarizerAgent;
	private docWriterAgent: DocWriterAgent;
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;

		// Initialize prompt manager with default templates
		promptManager.loadDefaultTemplates();

		// Create agents with default templates
		this.summarizerAgent = createSummarizerAgent(apiKey);
		this.docWriterAgent = createDocWriterAgent(apiKey);
	}

	async updateDocumentation(
		request: DocumentationUpdateRequest,
	): Promise<DocumentationUpdateResult> {
		try {
			// Step 1: Summarize the code changes
			console.log("🔍 Analyzing code changes...");

			// Switch templates if specified
			if (request.summarizerTemplate) {
				this.summarizerAgent.setTemplate(request.summarizerTemplate);
			}
			if (request.docWriterTemplate) {
				this.docWriterAgent.setTemplate(request.docWriterTemplate);
			}

			const summaryInput: CodeSummaryInput = {
				filename: request.filename,
				filePurpose: request.filePurpose,
				diffContent: request.diffContent,
				existingDocContext: this.getExistingDocContext(
					request.projectDir,
					request.docType || "readme",
				),
			};

			const summary = await this.summarizerAgent.summarizeChanges(summaryInput);
			console.log("✅ Code analysis complete");

			// Step 2: Update documentation based on summary
			console.log("📝 Updating documentation...");

			const existingDoc = this.getExistingDocumentation(
				request.projectDir,
				request.docType || "readme",
			);

			const docWriterInput: DocWriterInput = {
				codeSummary: summary,
				existingDoc,
				docType: request.docType || "readme",
				targetAudience: request.targetAudience || "developers",
				projectType: this.detectProjectType(request.projectDir),
			};

			const documentation =
				await this.docWriterAgent.updateDocumentation(docWriterInput);
			console.log("✅ Documentation update complete");

			return {
				summary,
				documentation,
				success: true,
			};
		} catch (error) {
			console.error("❌ Documentation update failed:", error);
			return {
				summary: null,
				documentation: null,
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private getExistingDocumentation(
		projectDir: string,
		docType: string,
	): string {
		const docFiles = {
			readme: "README.md",
			api: "API.md",
			changelog: "CHANGELOG.md",
			contributing: "CONTRIBUTING.md",
		};

		const filename = docFiles[docType as keyof typeof docFiles] || "README.md";
		const filepath = join(projectDir, filename);

		if (existsSync(filepath)) {
			return readFileSync(filepath, "utf-8");
		}

		return `# ${this.getProjectName(projectDir)}

This documentation file will be created based on your code changes.
`;
	}

	private getExistingDocContext(projectDir: string, docType: string): string {
		const existingDoc = this.getExistingDocumentation(projectDir, docType);

		// Extract key sections for context
		const headers = existingDoc.match(/^#{1,6}\s+(.+)$/gm) || [];
		const sections = headers.map((h) => h.replace(/^#+\s+/, "")).join(", ");

		return `Existing sections: ${sections}`;
	}

	private detectProjectType(projectDir: string): string {
		const packageJsonPath = join(projectDir, "package.json");
		const pyprojectPath = join(projectDir, "pyproject.toml");
		const cargoPath = join(projectDir, "Cargo.toml");

		if (existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
				if (packageJson.type === "module") return "ES Module";
				if (packageJson.bin) return "CLI Tool";
				if (packageJson.scripts?.start) return "Application";
				return "Node.js Library";
			} catch {
				return "Node.js Project";
			}
		}

		if (existsSync(pyprojectPath)) return "Python Project";
		if (existsSync(cargoPath)) return "Rust Project";

		return "Software Project";
	}

	private getProjectName(projectDir: string): string {
		const packageJsonPath = join(projectDir, "package.json");

		if (existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
				return packageJson.name || "Project";
			} catch {
				// Fall through to directory name
			}
		}

		return projectDir.split("/").pop() || "Project";
	}

	/**
	 * A/B test different prompt templates
	 */
	async testTemplates(
		request: DocumentationUpdateRequest,
		templatePairs: Array<{
			summarizerTemplate: string;
			docWriterTemplate: string;
			name: string;
		}>,
	): Promise<
		Array<{
			name: string;
			result: DocumentationUpdateResult;
			metrics: any;
		}>
	> {
		const results = [];

		for (const templatePair of templatePairs) {
			console.log(`\n🧪 Testing template pair: ${templatePair.name}`);

			const testRequest = {
				...request,
				summarizerTemplate: templatePair.summarizerTemplate,
				docWriterTemplate: templatePair.docWriterTemplate,
			};

			const result = await this.updateDocumentation(testRequest);

			// Get metrics from prompt manager
			const summarizerResults = promptManager.getTestResults(
				templatePair.summarizerTemplate,
			);
			const docWriterResults = promptManager.getTestResults(
				templatePair.docWriterTemplate,
			);

			results.push({
				name: templatePair.name,
				result,
				metrics: {
					summarizer: summarizerResults[0]?.metrics || {},
					docWriter: docWriterResults[0]?.metrics || {},
				},
			});
		}

		return results;
	}

	/**
	 * Get performance comparison between templates
	 */
	getTemplateComparison(templateIds: string[]): Record<string, any> {
		return promptManager.compareTemplates(templateIds);
	}
}

export function createDocumentationService(
	apiKey: string,
): DocumentationService {
	return new DocumentationService(apiKey);
}
