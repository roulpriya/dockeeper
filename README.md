# Document Keeper

AI-powered document agent that analyzes code changes and updates documentation automatically.

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Summarize Codebase Tool](#summarize-codebase-tool)
- [Prompt System and Testing](#prompt-system-and-testing)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features

Document Keeper is an automation tool designed to keep project documentation up to date, leveraging AI agents and modular prompt templates to:

- Analyze code changes and file diffs
- Generate and update README, API, and CHANGELOG files
- Summarize codebase structure, dependencies, and key functions
- Warns about unstaged/untracked changes not included in diffs
- CLI and programmatic APIs
- Extensible and ready for custom template or agent additions
- **NEW:** Summarize entire codebase with the `summarize_codebase` tool (see below)
- **NEW:** Ignore pattern management via `.dockeeperignore` and utility functions
- **NEW:** Persistent code summary cache for improved performance
- **NEW:** Parallel codebase analysis and integrated documentation workflow (`enhancedSummarizeCodebaseTool` and `IntegratedDocumentationService`)

## Installation

```bash
npm install
yarn install
```

- Requires Node.js 18+.
- Set your OpenAI API key in `.env` or as `OPENAI_API_KEY` environment variable.

## Usage

You can run Document Keeper in development or production mode, or directly via the provided CLI:

```bash
npm run dev
npm run build && npm start
```

The agent will analyze the specified code changes in the Git repository and update or create documentation files as needed.

## Summarize Codebase Tool

**(New Feature)**

The `summarize_codebase` tool allows you to analyze and summarize an entire codebase or directory tree, generating structured summaries for all supported source files. This is useful for onboarding, documentation generation, or gaining high-level overviews.

**Key Features:**
- Recursively scans directories for source files (supports `.ts`, `.js`, `.py`, `.java`, `.cpp`, and more)
- Respects `.dockeeperignore` and additional ignore patterns
- Chunks large files for scalable summarization
- Extracts key functions, dependencies, and exported symbols
- Caches results for performance
- Returns:
  - Overall project structure and components
  - File-by-file summaries and statistics

**Usage Example:**
```typescript
import { summarizeCodebaseTool } from './src/tools/summarize-codebase-tool';

const result = await summarizeCodebaseTool.handler({
  path: './src',
  apiKey: process.env.OPENAI_API_KEY,
  maxDepth: 10, // optional
  chunkSize: 100, // optional
  ignorePatterns: ['test/', '*.spec.ts'] // optional
});

if (result.success) {
  console.log(result.summary);
} else {
  console.error(result.error);
}
```

**CLI use:** (to be documented in a future release)

### Enhanced Codebase Summarization & Integrated Documentation (NEW)

- **`enhancedSummarizeCodebaseTool`**: Provides parallel analysis and optional documentation generation for larger codebases.
- **Integrated Documentation Service**: High-level workflow for summarizing, grouping, and generating documentation (README, API, CHANGELOG) for each module and the entire project.

**Usage Example:**
```typescript
import { enhancedSummarizeCodebaseTool } from './src/tools/summarize-codebase-tool-enhanced';
import { createIntegratedDocumentationService } from './src/services/integrated-documentation-service';

// Parallel summarization and docs:
const result = await enhancedSummarizeCodebaseTool.handler({
  path: './src',
  apiKey: process.env.OPENAI_API_KEY,
  parallel: true,
  maxConcurrency: 8,
  generateDocs: true,
  docTypes: ['readme', 'api', 'changelog']
});

if (result.success) {
  console.log(result.summary);
  // result.documentation contains generated docs
}

// Full integrated workflow:
const docsService = createIntegratedDocumentationService(process.env.OPENAI_API_KEY);
const docsResult = await docsService.processCodebaseAndGenerateDocumentation({
  codebasePath: './src',
  apiKey: process.env.OPENAI_API_KEY,
  docTypes: ['readme', 'api', 'changelog'],
  outputDir: 'docs'
});
```

## Prompt System and Testing

Document Keeper features a modular prompt template system and a prompt manager for managing, testing, and comparing prompt strategies:

- Add new templates in `src/prompt-manager.ts` or `prompt_tests/templates/`
- Run prompt tests via `prompt_tests/test-runner.ts`
- Compare summarization accuracy and performance

## Project Structure

```
dockeeper/
├── src/
│   ├── agents/                # Summarizer and DocWriter agent logic
│   ├── tools/                 # File and directory manipulation tools
│   │   ├── summarize-codebase-tool.ts         # (NEW) Codebase summarization tool
│   │   ├── summarize-codebase-tool-enhanced.ts# (NEW) Parallel summarization & docs
│   ├── utils/                 # Utility modules (ignore patterns, summary cache)
│   ├── services/              # (NEW) Integrated documentation workflow
│   ├── documentation-service.ts  # Main orchestration service
│   ├── git.ts                 # Git integration and diff logic
│   ├── prompt-manager.ts      # Prompt system and test/metrics manager
├── prompt_tests/
│   ├── templates/             # Prompt test cases and templates
│   ├── results/               # Test results and metrics
│   ├── test-runner.ts         # Main test runner
│   └── integration-example.ts # Integration demonstration
├── .dockeeperignore           # Ignore patterns for codebase scanning
├── MODULAR_PROMPTS.md         # Modular prompt architecture & template docs
├── package.json               # Project dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── README.md                  # (This file)
```

## Contributing

Contributions are welcome! Please follow these guidelines:

- Open issues for bugs, ideas, or enhancements
- Use PRs for code and documentation changes
- Define new templates in `src/prompt-manager.ts` and/or `prompt_tests/templates/`
- Add test cases in `prompt_tests/test-runner.ts`
- Track results in `prompt_tests/results/`
- When adding new tools, document them in this README and add usage examples.
- For major architectural or feature changes, update the documentation and project structure diagrams.

## License

MIT License
