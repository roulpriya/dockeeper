import { Agent } from "./agents";
import { lsTool, readTool, treeTool } from "./tools";

export interface FileSummary {
	file: string;
	summary: string;
	changeType: "added" | "modified" | "deleted" | "renamed";
	linesAdded: number;
	linesDeleted: number;
}

export interface DiffSummary {
	overallSummary: string;
	fileSummaries: FileSummary[];
	totalFilesChanged: number;
	totalLinesAdded: number;
	totalLinesDeleted: number;
}

function generateSummarizerPrompt(projectDir: string) {
	return `You are an AI-powered code change summarizer for software projects.
Your task is to analyze git diffs and provide structured summaries of changes.

You have access to the following input variables:

<project_directory>
${projectDir}
</project_directory>

You have access to the following tools:
1. read(file_path): Reads the content of a file
2. tree(): Displays the directory structure of the project
3. ls(directory): Lists the contents of a directory

Your task is to analyze the provided git diff and generate a comprehensive summary.

For each file in the diff, you should:
1. Identify the type of change (added, modified, deleted, renamed)
2. Count lines added and deleted
3. Provide a concise summary of what changed in the file
4. Categorize the change (feature, bugfix, refactoring, test, documentation, etc.)

Provide your output in the following structured format:

<overall_summary>
Brief 1-2 sentence summary of all changes
</overall_summary>

<file_summaries>
For each file:
- File: [file path]
- Change Type: [added|modified|deleted|renamed]
- Lines Added: [number]
- Lines Deleted: [number]
- Summary: [Brief description of changes]
- Category: [feature|bugfix|refactoring|test|documentation|config|other]
</file_summaries>

<statistics>
- Total Files Changed: [number]
- Total Lines Added: [number]
- Total Lines Deleted: [number]
</statistics>

Focus on the semantic meaning of changes rather than just syntax. Identify patterns and group related changes together in your summary.
`;
}

export class DiffSummarizer {
	private agent: Agent;

	constructor(apiKey: string, projectDir: string) {
		this.agent = new Agent({
			apiKey,
			model: "gpt-4.1",
			systemPrompt: generateSummarizerPrompt(projectDir),
			temperature: 0.3,
			tools: [readTool, treeTool, lsTool],
		});
	}

	async summarizeDiff(diff: string): Promise<DiffSummary> {
		const prompt = `Analyze the following git diff and provide a structured summary:

<git_diff>
${diff}
</git_diff>

Please analyze this diff and provide a comprehensive summary following the format specified in your system prompt.`;

		const response = await this.agent.chat(prompt);
		return this.parseSummaryResponse(response);
	}

	async summarizeFileDiffs(
		fileDiffs: Map<string, string>,
	): Promise<DiffSummary> {
		const summaries: FileSummary[] = [];
		let totalLinesAdded = 0;
		let totalLinesDeleted = 0;

		for (const [file, diff] of fileDiffs) {
			const fileSummary = await this.summarizeFileDiff(file, diff);
			summaries.push(fileSummary);
			totalLinesAdded += fileSummary.linesAdded;
			totalLinesDeleted += fileSummary.linesDeleted;
		}

		const overallSummary = await this.generateOverallSummary(summaries);

		return {
			overallSummary,
			fileSummaries: summaries,
			totalFilesChanged: summaries.length,
			totalLinesAdded,
			totalLinesDeleted,
		};
	}

	private async summarizeFileDiff(
		file: string,
		diff: string,
	): Promise<FileSummary> {
		const prompt = `Analyze the following git diff for a single file and provide a summary:

<file_path>
${file}
</file_path>

<git_diff>
${diff}
</git_diff>

Provide a concise summary of what changed in this file, including:
- The type of change (added, modified, deleted, renamed)
- Number of lines added and deleted
- Brief description of the changes
`;

		const response = await this.agent.chat(prompt);
		return this.parseFileSummary(file, response, diff);
	}

	private async generateOverallSummary(
		fileSummaries: FileSummary[],
	): Promise<string> {
		const summariesText = fileSummaries
			.map((fs) => `${fs.file}: ${fs.summary} (${fs.changeType})`)
			.join("\n");

		const prompt = `Based on the following individual file summaries, provide a brief 1-2 sentence overall summary of all changes:

${summariesText}

Focus on the main themes and purposes of the changes.`;

		return await this.agent.chat(prompt);
	}

	private parseSummaryResponse(response: string): DiffSummary {
		const overallMatch = response.match(
			/<overall_summary>(.*?)<\/overall_summary>/s,
		);
		const filesSummariesMatch = response.match(
			/<file_summaries>(.*?)<\/file_summaries>/s,
		);
		const statsMatch = response.match(/<statistics>(.*?)<\/statistics>/s);

		const overallSummary = overallMatch?.[1]?.trim() || "Summary not available";

		const fileSummaries: FileSummary[] = [];
		if (filesSummariesMatch) {
			const fileEntries = filesSummariesMatch[1]
				.split("- File:")
				.filter(Boolean);
			for (const entry of fileEntries) {
				const parsed = this.parseFileEntry(entry);
				if (parsed) fileSummaries.push(parsed);
			}
		}

		let totalFilesChanged = 0;
		let totalLinesAdded = 0;
		let totalLinesDeleted = 0;

		if (statsMatch) {
			const stats = statsMatch[1];
			const filesMatch = stats.match(/Total Files Changed: (\d+)/);
			const addedMatch = stats.match(/Total Lines Added: (\d+)/);
			const deletedMatch = stats.match(/Total Lines Deleted: (\d+)/);

			totalFilesChanged = filesMatch
				? Number.parseInt(filesMatch[1])
				: fileSummaries.length;
			totalLinesAdded = addedMatch ? Number.parseInt(addedMatch[1]) : 0;
			totalLinesDeleted = deletedMatch ? Number.parseInt(deletedMatch[1]) : 0;
		}

		return {
			overallSummary,
			fileSummaries,
			totalFilesChanged,
			totalLinesAdded,
			totalLinesDeleted,
		};
	}

	private parseFileEntry(entry: string): FileSummary | null {
		const fileMatch = entry.match(/^(.*?)\n/);
		const changeTypeMatch = entry.match(
			/Change Type: (added|modified|deleted|renamed)/,
		);
		const linesAddedMatch = entry.match(/Lines Added: (\d+)/);
		const linesDeletedMatch = entry.match(/Lines Deleted: (\d+)/);
		const summaryMatch = entry.match(/Summary: (.*?)(?:\n|$)/s);

		if (!fileMatch || !changeTypeMatch) return null;

		return {
			file: fileMatch[1].trim(),
			changeType: changeTypeMatch[1] as
				| "added"
				| "modified"
				| "deleted"
				| "renamed",
			linesAdded: linesAddedMatch ? Number.parseInt(linesAddedMatch[1]) : 0,
			linesDeleted: linesDeletedMatch
				? Number.parseInt(linesDeletedMatch[1])
				: 0,
			summary: summaryMatch?.[1]?.trim() || "No summary available",
		};
	}

	private parseFileSummary(
		file: string,
		response: string,
		diff: string,
	): FileSummary {
		const lines = diff.split("\n");
		let linesAdded = 0;
		let linesDeleted = 0;
		let changeType: "added" | "modified" | "deleted" | "renamed" = "modified";

		for (const line of lines) {
			if (line.startsWith("+") && !line.startsWith("+++")) {
				linesAdded++;
			} else if (line.startsWith("-") && !line.startsWith("---")) {
				linesDeleted++;
			}
		}

		if (diff.includes("new file mode")) {
			changeType = "added";
		} else if (diff.includes("deleted file mode")) {
			changeType = "deleted";
		} else if (diff.includes("similarity index") && diff.includes("rename")) {
			changeType = "renamed";
		}

		return {
			file,
			changeType,
			linesAdded,
			linesDeleted,
			summary: response.trim(),
		};
	}
}
