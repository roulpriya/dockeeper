# Document Keeper

AI-powered document agent that analyzes code changes and updates documentation automatically.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Prompt System and Testing](#prompt-system-and-testing)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Overview
Document Keeper is an automation tool designed to keep project documentation up to date by analyzing code changes and automatically editing or generating documentation files such as `README.md`, `CONTRIBUTING.md`, and `DESIGN.md`. It leverages OpenAI's LLMs and integrates with Git for accurate change tracking. The system features modular, testable agents and a prompt template manager supporting A/B testing and versioned prompt strategies.

## Features
- Analyzes code changes using Git
- Supports flexible comparison of staged changes or any two Git refs (branches, commits, tags)
- Detects and updates documentation files automatically (README, API docs, Changelog, etc.)
- Agent-based architecture: SummarizerAgent and DocWriterAgent pipeline
- Modular prompt template system with versioning and variable substitution
- PromptManager for A/B template testing, metrics, and export
- Performance metrics: completeness, accuracy, consistency, response time
- Warns about unstaged/untracked changes not included in diffs
- CLI and programmatic APIs
- Extensible and ready for custom template or agent additions

## Installation

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd dockeeper
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Set up environment variables:**
   - Create a `.env` file in the project root and add your OpenAI API key:
     ```sh
     OPENAI_API_KEY=your-openai-api-key
     ```
4. **Build the project:**
   ```sh
   npm run build
   ```

## Usage

You can run Document Keeper in development or production mode, or directly via the CLI after building:

- **Development:**
  ```sh
  npm run dev
  ```
- **Production:**
  ```sh
  npm start
  ```
- **As a CLI Tool:**
  ```sh
  npx document-keeper [<sourceRef> [<targetRef>]]
  ```
  or
  ```sh
  docai [path] [options]
  ```

### CLI Arguments
- `sourceRef` (optional): The base Git ref (commit, branch, or tag) to compare from.
- `targetRef` (optional): The target Git ref to compare to (defaults to `HEAD` if only `sourceRef` is provided).
- `path` (optional): Path to the repository (default: current directory)
- `-B, --base <ref>`: Base reference for comparison
- `-H, --head <ref>`: Head reference for comparison
- `-h, --help`: Show help message

**Examples:**
- Compare two specific refs:
  ```sh
  npx document-keeper main feature-branch
  ```
  or
  ```sh
  docai -B main -H feature-branch
  ```
- Compare a ref to the current HEAD:
  ```sh
  npx document-keeper 1234abcd
  ```
  or
  ```sh
  docai -B 1234abcd
  ```
- Default (no arguments): compares staged changes only.
- Specify a repository path:
  ```sh
  docai /path/to/repo -B main -H feature
  ```

**Note:**
- The tool will warn you if there are unstaged or untracked changes, as these are not included in the diff calculation.
- If no changes are found (e.g., no staged files), it will notify you and exit.

The agent will analyze the specified code changes in the Git repository and update or create documentation files as needed.

## Prompt System and Testing

Document Keeper features a modular prompt template system and a prompt manager for managing, testing, and comparing prompt strategies:

- **PromptManager**: Register, render, and export prompt templates. Supports variable substitution (with `{{variable}}` syntax).
- **A/B Testing**: Test multiple summarizer/doc-writer template pairs and compare results/metrics.
- **Performance Metrics**: Tracks completeness, accuracy, consistency, and response time for each run. Results are saved in `prompt_tests/results/`.
- **Templates**: See `prompt_tests/templates/` or `src/prompt-manager.ts` for template definitions.

### Programmatic Usage Example
```typescript
import { createDocumentationService } from './src/documentation-service';

const docService = createDocumentationService(apiKey);

const result = await docService.updateDocumentation({
  filename: 'src/git.ts',
  filePurpose: 'Git integration module',
  diffContent: gitDiffString,
  projectDir: process.cwd(),
  docType: 'readme',
  targetAudience: 'developers'
});

// For A/B testing
const abResults = await docService.testTemplates(inputData, [
  {
    name: 'Detailed Analysis',
    summarizerTemplate: 'summarizer-v1.0',
    docWriterTemplate: 'doc-writer-v1.0'
  },
  {
    name: 'Concise Analysis',
    summarizerTemplate: 'summarizer-v1.1',
    docWriterTemplate: 'doc-writer-v1.1'
  }
]);
```

For more details, see [`MODULAR_PROMPTS.md`](./MODULAR_PROMPTS.md) and [`prompt_tests/README.md`](./prompt_tests/README.md).

## Project Structure
```
dockeeper/
├── src/
│   ├── agents/                # Summarizer and DocWriter agent logic
│   ├── tools/                 # File and directory manipulation tools
│   ├── documentation-service.ts  # Main orchestration service
│   ├── git.ts                 # Git integration and diff logic
│   ├── prompt-manager.ts      # Prompt system and test/metrics manager
│   └── index.ts               # CLI entry point
├── prompt_tests/
│   ├── templates/             # Prompt template definitions
│   ├── mock_inputs/           # Sample data for testing
│   ├── results/               # Test results and metrics
│   ├── test-runner.ts         # Main test runner
│   └── integration-example.ts # Integration demonstration
├── MODULAR_PROMPTS.md         # Modular prompt architecture & template docs
├── package.json               # Project dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── README.md                  # Project documentation
└── ...
```

## Contributing

Contributions are welcome! Please follow these guidelines:
- Open issues for bugs or feature requests.
- Submit pull requests from feature branches.
- Ensure code is linted and type-checked (`npm run lint`, `npm run typecheck`).
- Add or update tests and documentation as needed.
- When adding prompt templates:
  - Define new templates in `src/prompt-manager.ts` and/or `prompt_tests/templates/`
  - Add test cases in `prompt_tests/test-runner.ts`
  - Track results in `prompt_tests/results/`

## License

This project is licensed under the MIT License.
