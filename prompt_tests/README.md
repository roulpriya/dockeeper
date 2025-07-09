# Prompt Testing Framework

## Overview

This directory contains a comprehensive prompt testing framework for the Document Keeper's AI agents. The framework includes modular prompt templates, A/B testing capabilities, and performance metrics.

## Structure

```
prompt_tests/
├── templates/              # Prompt template definitions
│   ├── summarizer-agent.md    # Summarizer agent templates
│   └── doc-writer-agent.md    # Doc writer agent templates
├── mock_inputs/            # Sample data for testing
│   ├── git-diff-sample.txt     # Git module changes
│   └── agent-diff-sample.txt   # Agent module changes
├── results/                # Test results and metrics
├── test-runner.ts          # Main test runner
├── integration-example.ts  # Integration demonstration
└── README.md              # This file
```

## Prompt Templates

### Summarizer Agent Templates

The Summarizer Agent analyzes code changes and extracts key information for documentation updates.

#### Template v1.0 (Detailed Analysis)
- **Purpose**: Comprehensive code analysis with structured JSON output
- **Variables**: `filename`, `file_purpose`, `diff_content`
- **Output**: Detailed JSON with change type, key changes, impact areas, dependencies, and recommendations

#### Template v1.1 (Concise Analysis)
- **Purpose**: Quick, focused analysis with minimal output
- **Variables**: `filename`, `file_purpose`, `diff_content`
- **Output**: Concise JSON with essential information only

### Doc Writer Agent Templates

The Doc Writer Agent updates documentation based on code analysis summaries.

#### Template v1.0 (Comprehensive Writer)
- **Purpose**: Detailed documentation updates with quality checklist
- **Variables**: `code_summary`, `existing_doc`, `doc_type`, `target_audience`
- **Output**: Complete updated documentation with change summary

#### Template v1.1 (Focused Writer)
- **Purpose**: Quick documentation updates with minimal overhead
- **Variables**: `code_summary`, `existing_doc`, `doc_type`
- **Output**: Focused documentation updates

## Agent Chaining

The framework demonstrates how the Summarizer and Doc Writer agents work together:

1. **Summarizer Agent** → Analyzes code changes and extracts key information
2. **Doc Writer Agent** → Uses the summary to update documentation

```typescript
// Example chaining workflow
const summary = await summarizerAgent.summarizeChanges(codeInput);
const documentation = await docWriterAgent.updateDocumentation({
  codeSummary: summary,
  existingDoc: readmeContent,
  docType: 'readme'
});
```

## Testing

### Running Tests

```bash
# Test single prompt template
npm run test-prompts single

# Compare multiple templates
npm run test-prompts compare

# Run integration example
npx ts-node prompt_tests/integration-example.ts
```

### Test Metrics

The framework tracks several metrics:

- **Completeness**: How well the agent addresses all required fields
- **Accuracy**: Quality of the generated content (requires human evaluation)
- **Consistency**: Consistency across multiple runs
- **Response Time**: Time taken to generate response

### A/B Testing

The framework supports A/B testing different prompt templates:

```typescript
const results = await docService.testTemplates(testInput, [
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

## Prompt Manager

The `PromptManager` class provides:

- **Template Registration**: Store and manage prompt templates
- **Variable Substitution**: Replace template variables with actual values
- **Test Result Storage**: Save and retrieve test results
- **Performance Comparison**: Compare template performance metrics

### Usage Example

```typescript
import { promptManager } from '../src/prompt-manager';

// Load default templates
promptManager.loadDefaultTemplates();

// Render a prompt with variables
const prompt = promptManager.renderPrompt('summarizer-v1.0', {
  filename: 'src/git.ts',
  file_purpose: 'Git integration module',
  diff_content: diffString
});

// Get test results
const results = promptManager.getTestResults('summarizer-v1.0');

// Compare templates
const comparison = promptManager.compareTemplates([
  'summarizer-v1.0', 'summarizer-v1.1'
]);
```

## Mock Data

The framework includes mock data for testing:

### Git Module Changes
- Adds constructor parameter for repository path
- Implements `compareRefs` method for flexible Git comparison
- Adds warning system for unstaged changes

### Agent Module Changes
- Adds conversation history management
- Updates default model to GPT-4
- Implements conversation reset functionality

## Best Practices

### Template Design
1. **Clear Instructions**: Use specific, actionable instructions
2. **Structured Output**: Define clear output formats (JSON, markdown)
3. **Variable Naming**: Use descriptive variable names with `{{variable}}` syntax
4. **Error Handling**: Consider edge cases and error conditions

### Testing
1. **Multiple Scenarios**: Test with different types of code changes
2. **Consistent Metrics**: Use consistent evaluation criteria
3. **Performance Tracking**: Monitor response times and quality
4. **Iterative Improvement**: Use results to refine templates

### A/B Testing
1. **Single Variable**: Change one aspect at a time
2. **Sufficient Samples**: Test with multiple inputs
3. **Statistical Significance**: Consider variance in results
4. **Human Evaluation**: Include human assessment for quality metrics

## Future Enhancements

1. **Advanced Metrics**: Implement more sophisticated quality metrics
2. **Automated Testing**: Set up CI/CD for prompt testing
3. **Template Versioning**: Better version management and migration
4. **Performance Optimization**: Optimize for speed and cost
5. **Human Feedback**: Integrate human evaluation workflows

## Contributing

When adding new prompt templates:

1. Create template files in `templates/`
2. Add template to `PromptManager.loadDefaultTemplates()`
3. Create test cases in `test-runner.ts`
4. Update this README with template details
5. Test against existing mock data

## Results Storage

Test results are automatically saved to `results/` directory as JSON files:

```json
{
  "templateId": "summarizer-v1.0",
  "testId": "summarizer_1234567890",
  "timestamp": "2024-01-01T00:00:00Z",
  "inputs": { ... },
  "output": "...",
  "metrics": {
    "completeness": 0.95,
    "accuracy": 0.8,
    "consistency": 0.9,
    "responseTime": 1500
  }
}
```

This enables tracking template performance over time and comparing results across different versions.