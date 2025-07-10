import { Agent } from "./agents";
import { DiffSummarizer, type DiffSummary } from "./summarizer-agent";
import { lsTool, readTool, treeTool, writeTool } from "./tools";

export interface DocumentationUpdate {
	file: string;
	summary: string;
	action: "created" | "updated" | "unchanged";
}

function generateEnhancedSystemPrompt(projectDir: string) {
	return `You are an AI-powered documentation agent for software projects.
Your task is to analyze code change summaries and update or create documentation files accordingly.

You have access to the following tools:
1. read(file_path): Reads the content of a file
2. write(file_path, content): Writes content to a file
3. tree(): Displays the directory structure of the project
4. ls(directory): Lists the contents of a directory

You will receive structured summaries of code changes including:
- Overall summary of changes
- File-specific summaries with change types and line counts
- Statistics about the total changes

Your task is to:
1. Analyze the provided change summaries
2. Update existing documentation files (README.md, CONTRIBUTING.md, DESIGN.md, etc.)
3. Create new documentation files if necessary
4. Ensure all documentation remains accurate and up-to-date

When updating documentation, focus on:
- Reflecting new features, APIs, or functionality
- Updating installation and usage instructions
- Documenting breaking changes
- Adding or updating examples
- Keeping version information current

Provide your output in structured format with clear summaries of what was changed in each documentation file.

Never ask for additional information or clarification - work with the provided summaries to make the best possible documentation updates.

You have access to the following input variables:

<project_directory>
${projectDir}
</project_directory>
`;
}

export class EnhancedDocumentationWriter {
	private agent: Agent;
	private summarizer: DiffSummarizer;
	private projectDir: string;

	constructor(apiKey: string, projectDir: string) {
		this.projectDir = projectDir;
		this.agent = new Agent({
			apiKey,
			model: "gpt-4.1",
			systemPrompt: generateEnhancedSystemPrompt(projectDir),
			temperature: 0.5,
			tools: [readTool, writeTool, treeTool, lsTool],
		});
		this.summarizer = new DiffSummarizer(apiKey, projectDir);
	}

	async updateDocumentationFromDiff(
		diff: string,
	): Promise<DocumentationUpdate[]> {
		const summary = await this.summarizer.summarizeDiff(diff);
		return this.updateDocumentationFromSummary(summary);
	}

	async updateDocumentationFromFileDiffs(
		fileDiffs: Map<string, string>,
	): Promise<DocumentationUpdate[]> {
		const summary = await this.summarizer.summarizeFileDiffs(fileDiffs);
		return this.updateDocumentationFromSummary(summary);
	}

	private async updateDocumentationFromSummary(
		summary: DiffSummary,
	): Promise<DocumentationUpdate[]> {
		const prompt = `Analyze the following code change summary and update documentation accordingly:

<change_summary>
<overall_summary>
${summary.overallSummary}
</overall_summary>

<file_changes>
${summary.fileSummaries
	.map(
		(fs) =>
			`<file_change>
<file>${fs.file}</file>
<summary>${fs.summary}</summary>
<change_type>${fs.changeType}</change_type>
<lines_added>${fs.linesAdded}</lines_added>
<lines_deleted>${fs.linesDeleted}</lines_deleted>
</file_change>`,
	)
	.join("\n")}
</file_changes>

<statistics>
<total_files_changed>${summary.totalFilesChanged}</total_files_changed>
<total_lines_added>${summary.totalLinesAdded}</total_lines_added>
<total_lines_deleted>${summary.totalLinesDeleted}</total_lines_deleted>
</statistics>
</change_summary>

# Instructions:
1. Use the tree() tool to understand the project structure
2. Check for existing documentation files using ls() and read()
3. Update or create documentation files as appropriate
4. Focus on user-facing changes and new functionality
5. Ensure all documentation is clear and accurate

Return your response in the following XML format:

<documentation_updates>
<update>
<file>path/to/file.md</file>
<action>created|updated|unchanged</action>
<summary>Brief description of what was changed</summary>
</update>
</documentation_updates>`;

		const response = await this.agent.chat(prompt);
		return this.parseDocumentationUpdates(response);
	}

	private parseDocumentationUpdates(response: string): DocumentationUpdate[] {
		const updates: DocumentationUpdate[] = [];

		// Try to extract structured information from the response
		// This is a simplified parser - in practice, you might want more sophisticated parsing
		const lines = response.split("\n");
		let currentFile = "";
		let currentSummary = "";
		let currentAction: "created" | "updated" | "unchanged" = "unchanged";

		for (const line of lines) {
			if (
				line.includes("README.md") ||
				line.includes("CONTRIBUTING.md") ||
				line.includes("DESIGN.md") ||
				line.includes(".md")
			) {
				// Extract file name
				const fileMatch = line.match(/(\w+\.md)/);
				if (fileMatch) {
					if (currentFile) {
						updates.push({
							file: currentFile,
							summary: currentSummary,
							action: currentAction,
						});
					}
					currentFile = fileMatch[1];
					currentSummary = "";
					currentAction = line.toLowerCase().includes("created")
						? "created"
						: line.toLowerCase().includes("updated")
							? "updated"
							: "unchanged";
				}
			} else if (currentFile && line.trim()) {
				currentSummary += `${line.trim()} `;
			}
		}

		// Add the last file if any
		if (currentFile) {
			updates.push({
				file: currentFile,
				summary: currentSummary.trim(),
				action: currentAction,
			});
		}

		return updates;
	}

	async generateHTMLSummary(summary: DiffSummary): Promise<string> {
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Changes Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .file-changes { margin-bottom: 20px; }
        .file-item { border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 5px; }
        .file-header { font-weight: bold; color: #333; }
        .change-type { padding: 2px 8px; border-radius: 3px; font-size: 12px; }
        .added { background: #d4edda; color: #155724; }
        .modified { background: #fff3cd; color: #856404; }
        .deleted { background: #f8d7da; color: #721c24; }
        .renamed { background: #cce5ff; color: #004085; }
        .stats { display: flex; gap: 20px; }
        .stat-item { text-align: center; }
    </style>
</head>
<body>
    <h1>Code Changes Summary</h1>
    
    <div class="summary">
        <h2>Overall Summary</h2>
        <p>${summary.overallSummary}</p>
    </div>
    
    <div class="stats">
        <div class="stat-item">
            <h3>${summary.totalFilesChanged}</h3>
            <p>Files Changed</p>
        </div>
        <div class="stat-item">
            <h3>+${summary.totalLinesAdded}</h3>
            <p>Lines Added</p>
        </div>
        <div class="stat-item">
            <h3>-${summary.totalLinesDeleted}</h3>
            <p>Lines Deleted</p>
        </div>
    </div>
    
    <div class="file-changes">
        <h2>File Changes</h2>
        ${summary.fileSummaries
					.map(
						(fs) => `
            <div class="file-item">
                <div class="file-header">${fs.file}</div>
                <div class="change-type ${fs.changeType}">${fs.changeType.toUpperCase()}</div>
                <p>${fs.summary}</p>
                <small>+${fs.linesAdded} lines, -${fs.linesDeleted} lines</small>
            </div>
        `,
					)
					.join("")}
    </div>
</body>
</html>`;

		return html;
	}
}
