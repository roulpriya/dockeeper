#!/usr/bin/env node

import "dotenv/config.js";
import { existsSync } from "node:fs";
import {
	DocumentationAgent,
	type ProcessingResult,
} from "./documentation-agent";

interface ParsedArgs {
	path: string;
	baseRef?: string;
	headRef?: string;
	help: boolean;
	html: boolean;
	staged: boolean;
}

function showHelp(): void {
	console.log(`Usage: docai [path] [options]

Arguments:
  path                 Repository path (default: current directory)

Options:
  -B, --base <ref>     Base reference for comparison
  -H, --head <ref>     Head reference for comparison  
  -h, --help           Show this help message
  --html               Generate HTML summary report
  --staged             Process staged changes instead of comparing refs

Examples:
  docai                          # Use current directory, process staged changes
  docai /path/to/repo            # Use specific path, process staged changes
  docai -B main -H feature       # Compare main to feature branch
  docai /path/to/repo -B v1.0.0  # Compare v1.0.0 to HEAD in specific path
  docai --html                   # Generate HTML report for staged changes
  docai -B main -H feature --html # Compare refs and generate HTML report`);
}

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		path: process.cwd(),
		help: false,
		html: false,
		staged: false,
	};

	let i = 0;
	while (i < args.length) {
		const arg = args[i];

		if (arg === "-h" || arg === "--help") {
			parsed.help = true;
			i++;
		} else if (arg === "--html") {
			parsed.html = true;
			i++;
		} else if (arg === "--staged") {
			parsed.staged = true;
			i++;
		} else if (arg === "-B" || arg === "--base") {
			if (i + 1 >= args.length) {
				throw new Error(`Option ${arg} requires a value`);
			}
			parsed.baseRef = args[i + 1];
			i += 2;
		} else if (arg === "-H" || arg === "--head") {
			if (i + 1 >= args.length) {
				throw new Error(`Option ${arg} requires a value`);
			}
			parsed.headRef = args[i + 1];
			i += 2;
		} else if (!arg.startsWith("-")) {
			// Positional argument (path)
			parsed.path = arg;
			i++;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	return parsed;
}

async function main() {
	try {
		const args = parseArgs(process.argv.slice(2));

		if (args.help) {
			showHelp();
			return;
		}

		// Validate path
		if (!existsSync(args.path)) {
			console.error(`Error: Path '${args.path}' does not exist.`);
			process.exit(1);
		}

		// Check for API key
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			console.error("Error: OPENAI_API_KEY environment variable is required");
			process.exit(1);
		}

		// Create Documentation Agent
		const docAgent = new DocumentationAgent(apiKey, args.path);

		// Show project info
		const projectInfo = await docAgent.getProjectInfo();
		console.log(`🚀 Processing project: ${projectInfo.projectDir}`);
		console.log(`🌿 Current branch: ${projectInfo.currentBranch || "unknown"}`);
		console.log(`📍 Last commit: ${projectInfo.lastCommit || "unknown"}`);

		let result: ProcessingResult;

		// Process based on arguments
		if (args.staged || (!args.baseRef && !args.headRef)) {
			// Process staged changes
			result = await docAgent.processStagedChanges(args.html);
		} else {
			// Validate refs if provided
			const validation = await docAgent.validateRefs(
				args.baseRef,
				args.headRef,
			);
			if (!validation.valid) {
				console.error("Validation errors:");
				for (const warning of validation.warnings) {
					console.error(`  - ${warning}`);
				}
				process.exit(1);
			}

			// Process diff between refs
			result = await docAgent.processLargeDiff(
				args.baseRef || "HEAD~1",
				args.headRef || "HEAD",
				args.html,
			);
		}

		// Display results
		console.log("\n📈 Processing Results:");
		console.log(`📊 ${result.summary.totalFilesChanged} files changed`);
		console.log(`➕ ${result.summary.totalLinesAdded} lines added`);
		console.log(`➖ ${result.summary.totalLinesDeleted} lines deleted`);

		if (result.documentationUpdates.length > 0) {
			console.log("\n📚 Documentation Updates:");
			for (const update of result.documentationUpdates) {
				const emoji =
					update.action === "created"
						? "✨"
						: update.action === "updated"
							? "📝"
							: "📄";
				console.log(`  ${emoji} ${update.file}: ${update.action}`);
			}
		}

		if (result.htmlOutputPath) {
			console.log(`\n🌐 HTML report saved to: ${result.htmlOutputPath}`);
		}

		console.log("\n✅ Documentation processing complete!");
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error: ${error.message}`);
		} else {
			console.error("An unknown error occurred");
		}
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch(console.error);
}
