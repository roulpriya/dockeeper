import { writeFileSync } from "node:fs";
import path from "node:path";
import { EnhancedDocumentationWriter } from "./enhanced-writer-agent";
import { Git } from "./git";
import { DiffSummarizer, type DiffSummary } from "./summarizer-agent";

export interface ProcessingResult {
	summary: DiffSummary;
	documentationUpdates: Array<{
		file: string;
		summary: string;
		action: "created" | "updated" | "unchanged";
	}>;
	htmlOutputPath?: string;
}

export class DocumentationAgent {
	private git: Git;
	private summarizer: DiffSummarizer;
	private writer: EnhancedDocumentationWriter;
	private projectDir: string;

	constructor(apiKey: string, projectDir: string = process.cwd()) {
		this.projectDir = projectDir;
		this.git = new Git(projectDir);
		this.summarizer = new DiffSummarizer(apiKey, projectDir);
		this.writer = new EnhancedDocumentationWriter(apiKey, projectDir);
	}

	async processLargeDiff(
		base: string,
		head: string,
		outputHtml = false,
	): Promise<ProcessingResult> {
		console.log("📊 Assembling file-specific diffs...");

		// Step 1: Assemble all the changes for each file
		const fileDiffs = await this.git.getFileSpecificDiffs(base, head);

		if (fileDiffs.size === 0) {
			throw new Error("No changes found between the specified refs");
		}

		console.log(`📋 Found changes in ${fileDiffs.size} files`);

		// Step 2: Ask summarizer agent to describe the changes
		console.log("🤖 Generating change summaries...");
		const summary = await this.summarizer.summarizeFileDiffs(fileDiffs);

		console.log("📝 Overall Summary:", summary.overallSummary);
		console.log(
			`📊 Statistics: ${summary.totalFilesChanged} files, +${summary.totalLinesAdded}/-${summary.totalLinesDeleted} lines`,
		);

		// Step 3: Pass file summaries to documentation writer
		console.log("📚 Updating documentation...");
		const documentationUpdates =
			await this.writer.updateDocumentationFromFileDiffs(fileDiffs);

		let htmlOutputPath: string | undefined;

		// Step 4: Generate HTML output if requested
		if (outputHtml) {
			console.log("🌐 Generating HTML summary...");
			htmlOutputPath = await this.generateHTMLReport(
				summary,
				documentationUpdates,
			);
			console.log(`✅ HTML report generated: ${htmlOutputPath}`);
		}

		return {
			summary,
			documentationUpdates,
			htmlOutputPath,
		};
	}

	async processStagedChanges(outputHtml = false): Promise<ProcessingResult> {
		console.log("📊 Getting staged changes...");

		const diff = await this.git.getAllDiffs();

		if (!diff.trim()) {
			throw new Error("No staged changes found");
		}

		console.log("🤖 Generating change summaries...");
		const summary = await this.summarizer.summarizeDiff(diff);

		console.log("📝 Overall Summary:", summary.overallSummary);
		console.log(
			`📊 Statistics: ${summary.totalFilesChanged} files, +${summary.totalLinesAdded}/-${summary.totalLinesDeleted} lines`,
		);

		console.log("📚 Updating documentation...");
		const documentationUpdates =
			await this.writer.updateDocumentationFromDiff(diff);

		let htmlOutputPath: string | undefined;

		if (outputHtml) {
			console.log("🌐 Generating HTML summary...");
			htmlOutputPath = await this.generateHTMLReport(
				summary,
				documentationUpdates,
			);
			console.log(`✅ HTML report generated: ${htmlOutputPath}`);
		}

		return {
			summary,
			documentationUpdates,
			htmlOutputPath,
		};
	}

	private async generateHTMLReport(
		summary: DiffSummary,
		documentationUpdates: Array<{
			file: string;
			summary: string;
			action: "created" | "updated" | "unchanged";
		}>,
	): Promise<string> {
		const html = await this.writer.generateHTMLSummary(summary);

		// Add documentation updates section to HTML
		const documentationSection = `
    <div class="documentation-updates">
        <h2>Documentation Updates</h2>
        ${documentationUpdates
					.map(
						(update) => `
            <div class="doc-update">
                <div class="doc-header">${update.file}</div>
                <div class="action ${update.action}">${update.action.toUpperCase()}</div>
                <p>${update.summary}</p>
            </div>
        `,
					)
					.join("")}
    </div>
</body>
</html>`;

		const enhancedHtml = html.replace("</body>\n</html>", documentationSection);

		// Add styles for documentation section
		const additionalStyles = `
        .documentation-updates { margin-top: 30px; }
        .doc-update { border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 5px; }
        .doc-header { font-weight: bold; color: #333; }
        .action { padding: 2px 8px; border-radius: 3px; font-size: 12px; }
        .action.created { background: #d4edda; color: #155724; }
        .action.updated { background: #fff3cd; color: #856404; }
        .action.unchanged { background: #f8f9fa; color: #6c757d; }
        `;

		const finalHtml = enhancedHtml.replace(
			"</style>",
			`${additionalStyles}</style>`,
		);

		const outputPath = path.join(this.projectDir, "diff-summary.html");
		writeFileSync(outputPath, finalHtml);

		return outputPath;
	}

	async validateRefs(
		baseRef?: string,
		headRef?: string,
	): Promise<{ valid: boolean; warnings: string[] }> {
		const warnings: string[] = [];
		let valid = true;

		if (baseRef) {
			const isValidBase = await this.git.isValidRef(baseRef);
			if (!isValidBase) {
				warnings.push(`Invalid base reference: ${baseRef}`);
				valid = false;
			}
		}

		if (headRef) {
			const isValidHead = await this.git.isValidRef(headRef);
			if (!isValidHead) {
				warnings.push(`Invalid head reference: ${headRef}`);
				valid = false;
			}
		}

		return { valid, warnings };
	}

	async getProjectInfo(): Promise<{
		projectDir: string;
		hasGitRepo: boolean;
		currentBranch?: string;
		lastCommit?: string;
	}> {
		const status = await this.git.getStatus();
		const log = await this.git.getLog(["-1"]);

		return {
			projectDir: this.projectDir,
			hasGitRepo: true,
			currentBranch: status.current || undefined,
			lastCommit: log.latest?.hash.substring(0, 7),
		};
	}
}
