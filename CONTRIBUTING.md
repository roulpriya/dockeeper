# Contributing to Dockeeper

Thank you for considering contributing to Dockeeper!

## How to Contribute
- **Open issues** for bugs, feature requests, or documentation improvements.
- **Submit pull requests** from feature branches. Clearly describe your changes and reference relevant issues.
- **Update documentation and tests** as needed when making code changes.
- **Run lint and type checks** before submitting:
  ```sh
  npm run lint
  npm run typecheck
  ```

## Documentation Automation
Dockeeper uses an AI-powered workflow to keep documentation up-to-date:
- On each push or pull request to main/master, the GitHub Actions workflow (`.github/workflows/dockeeper.yml`) runs Dockeeper to analyze code changes and update documentation files.
- If documentation changes are detected, they are committed and either a pull request is created or a comment is added to the PR.
- Please review and refine AI-generated documentation changes in your PRs as needed for clarity and accuracy.

## Coding Standards
- Follow the existing code style and structure.
- Write clear, descriptive commit messages.
- Keep pull requests focused and easy to review.

## Questions?
Open an issue or start a discussion in the repository.

Thank you for helping make Dockeeper better!
