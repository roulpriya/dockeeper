import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PromptTemplate {
	id: string;
	version: string;
	name: string;
	description: string;
	template: string;
	variables: string[];
	category: "summarizer" | "doc-writer";
}

export interface PromptTestResult {
	templateId: string;
	testId: string;
	timestamp: string;
	inputs: Record<string, any>;
	output: string;
	metrics: {
		completeness: number;
		accuracy: number;
		consistency: number;
		responseTime: number;
	};
	notes?: string;
}

export class PromptManager {
	private readonly promptsDir: string;
	private readonly testsDir: string;
	private readonly templates: Map<string, PromptTemplate> = new Map();

	constructor(baseDir = "./prompt_tests") {
		this.promptsDir = join(baseDir, "templates");
		this.testsDir = join(baseDir, "results");

		// Ensure directories exist
		if (!existsSync(this.promptsDir)) {
			mkdirSync(this.promptsDir, { recursive: true });
		}
		if (!existsSync(this.testsDir)) {
			mkdirSync(this.testsDir, { recursive: true });
		}
	}

	/**
	 * Register a prompt template
	 */
	registerTemplate(template: PromptTemplate): void {
		this.templates.set(template.id, template);
	}

	/**
	 * Get a prompt template by ID
	 */
	getTemplate(id: string): PromptTemplate | undefined {
		return this.templates.get(id);
	}

	/**
	 * Get all templates for a category
	 */
	getTemplatesByCategory(
		category: "summarizer" | "doc-writer",
	): PromptTemplate[] {
		return Array.from(this.templates.values()).filter(
			(t) => t.category === category,
		);
	}

	/**
	 * Render a prompt template with variables
	 */
	renderPrompt(templateId: string, variables: Record<string, any>): string {
		const template = this.getTemplate(templateId);
		if (!template) {
			throw new Error(`Template ${templateId} not found`);
		}

		let rendered = template.template;

		// Replace variables in the template
		for (const [key, value] of Object.entries(variables)) {
			const regex = new RegExp(`{{${key}}}`, "g");
			rendered = rendered.replace(regex, String(value));
		}

		// Check for unreplaced variables
		const unreplaced = rendered.match(/{{([^}]+)}}/g);
		if (unreplaced) {
			console.warn(
				`Warning: Unreplaced variables found: ${unreplaced.join(", ")}`,
			);
		}

		return rendered;
	}

	/**
	 * Save test result
	 */
	saveTestResult(result: PromptTestResult): void {
		const filename = `${result.testId}_${result.templateId}_${Date.now()}.json`;
		const filepath = join(this.testsDir, filename);
		writeFileSync(filepath, JSON.stringify(result, null, 2));
	}

	/**
	 * Load test results for a template
	 */
	getTestResults(templateId: string): PromptTestResult[] {
		const results: PromptTestResult[] = [];

		try {
			const files = require("node:fs").readdirSync(this.testsDir);
			for (const file of files) {
				if (file.includes(templateId) && file.endsWith(".json")) {
					const filepath = join(this.testsDir, file);
					const content = readFileSync(filepath, "utf-8");
					results.push(JSON.parse(content));
				}
			}
		} catch (error) {
			console.warn(`Could not load test results: ${error}`);
		}

		return results.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);
	}

	/**
	 * Compare template performance
	 */
	compareTemplates(templateIds: string[]): Record<string, any> {
		const comparison: Record<string, any> = {};

		for (const templateId of templateIds) {
			const results = this.getTestResults(templateId);
			if (results.length === 0) continue;

			const metrics = results.reduce(
				(acc, result) => {
					acc.completeness += result.metrics.completeness;
					acc.accuracy += result.metrics.accuracy;
					acc.consistency += result.metrics.consistency;
					acc.responseTime += result.metrics.responseTime;
					return acc;
				},
				{ completeness: 0, accuracy: 0, consistency: 0, responseTime: 0 },
			);

			comparison[templateId] = {
				testCount: results.length,
				averageMetrics: {
					completeness: metrics.completeness / results.length,
					accuracy: metrics.accuracy / results.length,
					consistency: metrics.consistency / results.length,
					responseTime: metrics.responseTime / results.length,
				},
				template: this.getTemplate(templateId),
			};
		}

		return comparison;
	}

	/**
	 * Export prompt templates to markdown
	 */
	exportTemplate(templateId: string): string {
		const template = this.getTemplate(templateId);
		if (!template) {
			throw new Error(`Template ${templateId} not found`);
		}

		return `# ${template.name} (${template.version})

## Description
${template.description}

## Variables
${template.variables.map((v) => `- \`{{${v}}}\``).join("\n")}

## Template
\`\`\`
${template.template}
\`\`\`

## Category
${template.category}
`;
	}

	/**
	 * Load templates from predefined templates
	 */
	loadDefaultTemplates(): void {
		// Summarizer templates
		this.registerTemplate({
			id: "summarizer-v1.0",
			version: "v1.0",
			name: "Detailed Analysis Summarizer",
			description: "Comprehensive code analysis with structured output",
			category: "summarizer",
			variables: ["filename", "file_purpose", "diff_content"],
			template: `You are a Code Summarizer Agent that analyzes code changes and extracts key information for documentation updates.

Your task is to analyze the provided code diff and generate a structured summary that will be used by the Doc Writer Agent.

## Input Context:
- **Filename**: {{filename}}
- **File Purpose**: {{file_purpose}}
- **Diff Content**: {{diff_content}}

## Analysis Instructions:
1. **Identify Change Type**: Determine if this is a new feature, bug fix, refactoring, or enhancement
2. **Extract Key Changes**: List the most important functional changes
3. **Identify Impact**: Determine what documentation sections might need updates
4. **Note Dependencies**: Identify any new dependencies or breaking changes
5. **Suggest Documentation Updates**: Recommend specific sections to update

## Output Format:
Provide your analysis in the following JSON format:

{
  "change_type": "new_feature|bug_fix|refactoring|enhancement|breaking_change",
  "filename": "{{filename}}",
  "file_purpose": "{{file_purpose}}",
  "key_changes": [
    "Brief description of change 1",
    "Brief description of change 2"
  ],
  "impact_areas": [
    "installation",
    "usage",
    "api_reference",
    "configuration",
    "dependencies"
  ],
  "new_dependencies": [],
  "breaking_changes": [],
  "documentation_recommendations": {
    "readme": "Specific suggestions for README updates",
    "api_docs": "Specific suggestions for API documentation",
    "changelog": "Specific suggestions for changelog"
  }
}

Focus on extracting actionable information that will help the Doc Writer Agent create accurate and comprehensive documentation updates.`,
		});

		this.registerTemplate({
			id: "summarizer-v1.1",
			version: "v1.1",
			name: "Concise Analysis Summarizer",
			description: "Quick, focused code analysis with minimal output",
			category: "summarizer",
			variables: ["filename", "file_purpose", "diff_content"],
			template: `You are a Code Summarizer Agent. Analyze the code diff and provide a concise summary for documentation updates.

## Input:
- **File**: {{filename}}
- **Purpose**: {{file_purpose}}
- **Diff**: {{diff_content}}

## Analysis:
Extract:
1. Change type (feature/fix/refactor/breaking)
2. Key functional changes (max 3)
3. Documentation impact areas
4. New dependencies or breaking changes

## Output (JSON):
{
  "change_type": "...",
  "filename": "{{filename}}",
  "key_changes": ["...", "..."],
  "impact_areas": ["readme", "api", "usage"],
  "new_dependencies": [],
  "breaking_changes": [],
  "doc_priority": "high|medium|low"
}

Keep analysis focused and actionable.`,
		});

		// Doc Writer templates
		this.registerTemplate({
			id: "doc-writer-v1.0",
			version: "v1.0",
			name: "Comprehensive Documentation Writer",
			description: "Detailed documentation updates with quality checklist",
			category: "doc-writer",
			variables: [
				"code_summary",
				"existing_doc",
				"doc_type",
				"target_audience",
			],
			template: `You are a Documentation Writer Agent that creates and updates technical documentation based on code analysis summaries.

## Input Context:
- **Code Summary**: {{code_summary}}
- **Existing Documentation**: {{existing_doc}}
- **Documentation Type**: {{doc_type}}
- **Target Audience**: {{target_audience}}

## Writing Guidelines:
1. **Maintain Consistency**: Follow the existing documentation style and structure
2. **User-Focused**: Write for the specified target audience
3. **Actionable Content**: Include concrete examples and steps
4. **Version Awareness**: Update version numbers and compatibility information

## Output Format:
Provide your updated documentation in markdown format, followed by a change summary.

## Change Summary:
- List the specific changes made
- Note any sections added or removed
- Highlight breaking changes if any

Focus on creating clear, actionable documentation that serves your target audience.`,
		});

		this.registerTemplate({
			id: "doc-writer-v1.1",
			version: "v1.1",
			name: "Focused Documentation Writer",
			description: "Quick documentation updates with minimal overhead",
			category: "doc-writer",
			variables: ["code_summary", "existing_doc", "doc_type"],
			template: `You are a Documentation Writer Agent. Update documentation based on code analysis.

## Input:
- **Code Summary**: {{code_summary}}
- **Current Doc**: {{existing_doc}}
- **Doc Type**: {{doc_type}}

## Instructions:
1. Analyze the code summary for documentation impact
2. Update the existing documentation sections
3. Maintain existing style and structure
4. Focus on user-actionable information

## Output:
Provide updated documentation in markdown format.

Keep updates focused and maintain consistency with existing documentation.`,
		});
	}
}

// Export singleton instance
export const promptManager = new PromptManager();
