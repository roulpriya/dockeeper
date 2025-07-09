import { promptManager } from "../prompt-manager";
import { Agent, type AgentConfig } from "./agent";

export interface CodeSummaryInput {
	filename: string;
	filePurpose: string;
	diffContent: string;
	existingDocContext?: string;
}

export interface CodeSummary {
	change_type:
		| "new_feature"
		| "bug_fix"
		| "refactoring"
		| "enhancement"
		| "breaking_change";
	filename: string;
	file_purpose: string;
	key_changes: string[];
	impact_areas: string[];
	new_dependencies: string[];
	breaking_changes: string[];
	documentation_recommendations: {
		readme?: string;
		api_docs?: string;
		changelog?: string;
	};
	doc_priority?: "high" | "medium" | "low";
}

export class SummarizerAgent extends Agent {
	private templateId: string;

	constructor(config: AgentConfig & { templateId?: string }) {
		super(config);
		this.templateId = config.templateId || "summarizer-v1.0";
	}

	async summarizeChanges(input: CodeSummaryInput): Promise<CodeSummary> {
		const startTime = Date.now();

		try {
			// Render the prompt using the template
			const prompt = promptManager.renderPrompt(this.templateId, {
				filename: input.filename,
				file_purpose: input.filePurpose,
				diff_content: input.diffContent,
				existing_doc_context: input.existingDocContext || "",
			});

			const response = await this.chat(prompt);

			// Try to parse JSON response
			let summary: CodeSummary;
			try {
				// Extract JSON from response if it's wrapped in markdown or text
				const jsonMatch = response.match(/\{[\s\S]*\}/);
				const jsonString = jsonMatch ? jsonMatch[0] : response;
				summary = JSON.parse(jsonString);
			} catch (parseError) {
				// If parsing fails, create a basic summary
				console.warn("Failed to parse JSON response, creating basic summary");
				summary = {
					change_type: "enhancement",
					filename: input.filename,
					file_purpose: input.filePurpose,
					key_changes: [response.substring(0, 100)],
					impact_areas: ["readme"],
					new_dependencies: [],
					breaking_changes: [],
					documentation_recommendations: {
						readme: response,
					},
				};
			}

			// Save test result
			promptManager.saveTestResult({
				templateId: this.templateId,
				testId: `summarizer_${Date.now()}`,
				timestamp: new Date().toISOString(),
				inputs: input,
				output: response,
				metrics: {
					completeness: this.calculateCompleteness(summary),
					accuracy: 0, // Would need human evaluation
					consistency: 0, // Would need comparison with other results
					responseTime: Date.now() - startTime,
				},
			});

			return summary;
		} catch (error) {
			console.error("Error in summarizeChanges:", error);
			throw error;
		}
	}

	private calculateCompleteness(summary: CodeSummary): number {
		const requiredFields = [
			"change_type",
			"filename",
			"key_changes",
			"impact_areas",
		];
		const presentFields = requiredFields.filter((field) => {
			const value = summary[field as keyof CodeSummary];
			return (
				value !== undefined &&
				value !== null &&
				(Array.isArray(value) ? value.length > 0 : String(value).length > 0)
			);
		});

		return presentFields.length / requiredFields.length;
	}

	setTemplate(templateId: string): void {
		this.templateId = templateId;
	}

	getTemplate(): string {
		return this.templateId;
	}
}

export function createSummarizerAgent(
	apiKey: string,
	templateId?: string,
): SummarizerAgent {
	return new SummarizerAgent({
		apiKey,
		model: "gpt-4",
		systemPrompt: "", // Will be set by template
		temperature: 0.3, // Lower temperature for more consistent analysis
		templateId,
	});
}
