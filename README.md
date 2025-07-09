# Dockeeper: AI-Powered Documentation Automation

Dockeeper is an AI-powered documentation agent that analyzes code changes and updates project documentation automatically. It integrates with Git, leverages OpenAI's LLMs, and can be run locally or as part of your CI pipeline to ensure your documentation always reflects the current state of your codebase.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Continuous Integration (CI)](#continuous-integration-ci)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Overview
Dockeeper automates the process of keeping your documentation up-to-date by analyzing code changes and automatically editing or generating documentation files such as `README.md`, `CONTRIBUTING.md`, and `DESIGN.md`. It uses AI summarization, advanced Git integration, and can operate both via CLI and in CI environments.

## Features
- **AI-powered code change summarization and documentation updates**
- **Enhanced Git integration**: Compare staged changes or any two Git refs (branches, commits, tags)
- **Automated documentation file updates** (README, CONTRIBUTING, DESIGN, etc.)
- **Supports HTML summary report generation**
- **Works in CI**: GitHub Actions workflow included for automated documentation PRs/comments
- **Warns about unstaged/untracked changes**
- **TypeScript and Node.js support**
- **Extensible agent-based architecture**
- **Rich CLI interface with new options (`--html`, `--staged`)**

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
You can run Dockeeper in development, production, or directly via the CLI after building:

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
  npx dockeeper [<sourceRef> [<targetRef>]] [options]
  ```

### CLI Options
- `sourceRef` (optional): Base Git ref (commit, branch, or tag) to compare from.
- `targetRef` (optional): Target Git ref to compare to (defaults to `HEAD` if only `sourceRef` is provided).
- `--base <ref>` / `-B`: Base reference for comparison
- `--head <ref>` / `-H`: Head reference for comparison
- `--staged`: Analyze only staged changes
- `--html`: Generate an HTML summary report
- `--help` / `-h`: Show help message

**Examples:**
- Compare two specific refs:
  ```sh
  npx dockeeper main feature-branch
  npx dockeeper -B main -H feature-branch
  ```
- Compare a ref to HEAD:
  ```sh
  npx dockeeper 1234abcd
  npx dockeeper -B 1234abcd
  ```
- Analyze staged changes only:
  ```sh
  npx dockeeper --staged
  ```
- Generate an HTML report:
  ```sh
  npx dockeeper main feature-branch --html
  ```

**Notes:**
- The tool warns if there are unstaged or untracked changes (not included in the diff).
- If no changes are found (e.g., no staged files), it will notify and exit.

## Continuous Integration (CI)
Dockeeper can run automatically in your CI pipeline using the included [GitHub Actions workflow](.github/workflows/dockeeper.yml):

- The workflow triggers on push and pull request events to main or master.
- It checks out the code, installs dependencies, builds the project, and runs Dockeeper.
- If documentation files are updated, it commits changes and creates a pull request or comments on existing PRs, keeping documentation in sync with code changes.

**To enable:**
- Ensure your repository contains `.github/workflows/dockeeper.yml` (already included).
- Set the required secrets (e.g., `OPENAI_API_KEY`) in your repository settings.

## Project Structure
```
dockeeper/
├── src/
│   ├── agents/                # Agent and tool interfaces
│   ├── tools/                 # File and directory manipulation tools
│   ├── documentation-agent.ts # Orchestrates summarization and documentation updates
│   ├── enhanced-writer-agent.ts # AI-powered doc file updater/creator
│   ├── summarizer-agent.ts    # AI-powered code change summarizer
│   ├── git.ts                 # Git integration and diff logic
│   ├── writer-agent.ts        # Documentation updating logic
│   └── index.ts               # Refactored CLI entry point (now supports --html, --staged)
├── .github/
│   └── workflows/
│       └── dockeeper.yml      # GitHub Actions workflow for documentation automation
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

## License
This project is licensed under the MIT License.
