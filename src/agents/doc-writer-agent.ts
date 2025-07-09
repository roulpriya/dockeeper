import { promptManager } from "../prompt-manager";
import { lsTool, readTool, treeTool, writeTool } from "../tools";
import { Agent, type AgentConfig } from "./agent";
import type { CodeSummary } from "./summarizer-agent";

export interface DocWriterInput {
	codeSummary: CodeSummary;
	existingDoc: string;
	docType: "readme" | "api" | "changelog" | "contributing";
	targetAudience?: "developers" | "users" | "contributors";
	projectType?: string;
}

export interface DocWriterOutput {
	updatedContent: string;
	changeSummary: string[];
	sectionsAdded: string[];
	sectionsRemoved: string[];
	breakingChanges: boolean;
}

export class DocWriterAgent extends Agent {
	private templateId: string;

	constructor(config: AgentConfig & { templateId?: string }) {
		super({
			...config,
			tools: [readTool, writeTool, treeTool, lsTool],
		});
		this.templateId = config.templateId || "doc-writer-v1.0";
	}

	async updateDocumentation(input: DocWriterInput): Promise<DocWriterOutput> {
		const startTime = Date.now();

		try {
			// Render the prompt using the template
			const prompt = promptManager.renderPrompt(this.templateId, {
				code_summary: JSON.stringify(input.codeSummary, null, 2),
				existing_doc: input.existingDoc,
				doc_type: input.docType,
				target_audience: input.targetAudience || "developers",
				project_type: input.projectType || "library",
			});

			const response = await this.chat(prompt);

			// Parse the response to extract structured information
			const output = this.parseDocWriterResponse(response, input);

			// Save test result
			promptManager.saveTestResult({
				templateId: this.templateId,
				testId: `doc_writer_${Date.now()}`,
				timestamp: new Date().toISOString(),
				inputs: input,
				output: response,
				metrics: {
					completeness: this.calculateCompleteness(output),
					accuracy: 0.85, // Would need human evaluation
					consistency: 0.9, // Would need comparison with existing docs
					responseTime: Date.now() - startTime,
				},
			});

			return output;
		} catch (error) {
			console.error("Error in updateDocumentation:", error);
			throw error;
		}
	}

	private parseDocWriterResponse(
		response: string,
		input: DocWriterInput,
	): DocWriterOutput {
		// Try to extract structured information from the response
		const updatedContent = this.extractUpdatedContent(response);
		const changeSummary = this.extractChangeSummary(response);

		return {
			updatedContent,
			changeSummary,
			sectionsAdded: this.detectSectionsAdded(
				input.existingDoc,
				updatedContent,
			),
			sectionsRemoved: this.detectSectionsRemoved(
				input.existingDoc,
				updatedContent,
			),
			breakingChanges: input.codeSummary.breaking_changes.length > 0,
		};
	}

	private extractUpdatedContent(response: string): string {
		// Look for markdown content in the response
		const markdownMatch = response.match(/```markdown\n([\s\S]*?)\n```/);
		if (markdownMatch) {
			return markdownMatch[1];
		}

		// If no markdown block, look for content after headers
		const contentMatch = response.match(
			/(?:# Updated Documentation|## Updated Content|Updated Documentation:)\n\n([\s\S]*?)(?:\n## |$)/,
		);
		if (contentMatch) {
			return contentMatch[1].trim();
		}

		// Fall back to the entire response
		return response;
	}

	private extractChangeSummary(response: string): string[] {
		const changes: string[] = [];

		// Look for change summary section
		const summaryMatch = response.match(
			/(?:## Changes Made|Change Summary|## Change Summary):\n([\s\S]*?)(?:\n## |$)/,
		);
		if (summaryMatch) {
			const summaryText = summaryMatch[1];
			const changeLines = summaryText
				.split("\n")
				.map((line) => line.trim())
				.filter(
					(line) =>
						line.startsWith("-") ||
						line.startsWith("*") ||
						line.startsWith("•"),
				)
				.map((line) => line.replace(/^[-*•]\s*/, ""));

			changes.push(...changeLines);
		}

		// If no explicit summary, try to infer from content
		if (changes.length === 0) {
			if (
				response.includes("Added") ||
				response.includes("Updated") ||
				response.includes("Modified")
			) {
				changes.push("Documentation updated based on code changes");
			}
		}

		return changes;
	}

	private detectSectionsAdded(oldDoc: string, newDoc: string): string[] {
		const oldHeaders = this.extractHeaders(oldDoc);
		const newHeaders = this.extractHeaders(newDoc);

		return newHeaders.filter((header) => !oldHeaders.includes(header));
	}

	private detectSectionsRemoved(oldDoc: string, newDoc: string): string[] {
		const oldHeaders = this.extractHeaders(oldDoc);
		const newHeaders = this.extractHeaders(newDoc);

		return oldHeaders.filter((header) => !newHeaders.includes(header));
	}

	private extractHeaders(content: string): string[] {
		const headerRegex = /^(#{1,6})\s+(.+)$/gm;
		const headers: string[] = [];
		let match: RegExpExecArray | null;

		while ((match = headerRegex.exec(content)) !== null) {
			headers.push(match[2].trim());
		}

		return headers;
	}

	private calculateCompleteness(output: DocWriterOutput): number {
		let score = 0;

		// Check if updated content exists and is substantial
		if (output.updatedContent && output.updatedContent.length > 100)
			score += 0.4;

		// Check if change summary exists
		if (output.changeSummary && output.changeSummary.length > 0) score += 0.3;

		// Check if sections were properly detected
		if (
			output.sectionsAdded !== undefined &&
			output.sectionsRemoved !== undefined
		)
			score += 0.2;

		// Check if breaking changes were handled
		if (output.breakingChanges !== undefined) score += 0.1;

		return score;
	}

	setTemplate(templateId: string): void {
		this.templateId = templateId;
	}

	getTemplate(): string {
		return this.templateId;
	}
}

export function createDocWriterAgent(
	apiKey: string,
	templateId?: string,
): DocWriterAgent {
	return new DocWriterAgent({
		apiKey,
		model: "gpt-4",
		systemPrompt: "", // Will be set by template
		temperature: 0.4, // Slightly higher for more creative writing
		templateId,
	});
}
