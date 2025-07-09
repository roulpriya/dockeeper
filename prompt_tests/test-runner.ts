#!/usr/bin/env node

import { createDocumentationService } from '../src/documentation-service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock inputs for testing
const mockInputs = {
  gitChanges: {
    filename: 'src/git.ts',
    filePurpose: 'Git integration module that handles repository operations and diff generation',
    diffContent: readFileSync(join(__dirname, 'mock_inputs/git-diff-sample.txt'), 'utf-8'),
    projectDir: process.cwd()
  },
  agentChanges: {
    filename: 'src/agents/agent.ts',
    filePurpose: 'Core agent class that provides AI chat capabilities with tool calling support',
    diffContent: readFileSync(join(__dirname, 'mock_inputs/agent-diff-sample.txt'), 'utf-8'),
    projectDir: process.cwd()
  }
};

async function testPromptTemplates() {
  console.log('🧪 Starting Prompt Template Tests\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const docService = createDocumentationService(apiKey);

  // Test configurations
  const testConfigs = [
    {
      name: 'Detailed Analysis (v1.0)',
      summarizerTemplate: 'summarizer-v1.0',
      docWriterTemplate: 'doc-writer-v1.0'
    },
    {
      name: 'Concise Analysis (v1.1)',
      summarizerTemplate: 'summarizer-v1.1',
      docWriterTemplate: 'doc-writer-v1.1'
    }
  ];

  // Test with Git changes
  console.log('📁 Testing with Git module changes...\n');
  
  const gitResults = await docService.testTemplates(mockInputs.gitChanges, testConfigs);
  
  for (const result of gitResults) {
    console.log(`\n📊 Results for ${result.name}:`);
    console.log(`Success: ${result.result.success}`);
    
    if (result.result.success) {
      console.log('Summary:', JSON.stringify(result.result.summary, null, 2));
      console.log('Documentation Changes:', result.result.documentation?.changeSummary || 'No changes detected');
      console.log('Metrics:', JSON.stringify(result.metrics, null, 2));
    } else {
      console.log('Error:', result.result.error);
    }
    
    console.log('-'.repeat(50));
  }

  // Test with Agent changes
  console.log('\n🤖 Testing with Agent module changes...\n');
  
  const agentResults = await docService.testTemplates(mockInputs.agentChanges, testConfigs);
  
  for (const result of agentResults) {
    console.log(`\n📊 Results for ${result.name}:`);
    console.log(`Success: ${result.result.success}`);
    
    if (result.result.success) {
      console.log('Summary:', JSON.stringify(result.result.summary, null, 2));
      console.log('Documentation Changes:', result.result.documentation?.changeSummary || 'No changes detected');
      console.log('Metrics:', JSON.stringify(result.metrics, null, 2));
    } else {
      console.log('Error:', result.result.error);
    }
    
    console.log('-'.repeat(50));
  }

  // Get template comparison
  console.log('\n📈 Template Performance Comparison:\n');
  
  const comparison = docService.getTemplateComparison([
    'summarizer-v1.0', 'summarizer-v1.1',
    'doc-writer-v1.0', 'doc-writer-v1.1'
  ]);
  
  console.log(JSON.stringify(comparison, null, 2));
}

async function testSinglePrompt() {
  console.log('🔍 Testing Single Prompt Template\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const docService = createDocumentationService(apiKey);

  try {
    const result = await docService.updateDocumentation({
      ...mockInputs.gitChanges,
      docType: 'readme',
      targetAudience: 'developers'
    });

    console.log('✅ Single prompt test results:');
    console.log('Success:', result.success);
    
    if (result.success) {
      console.log('\n📋 Summary:');
      console.log(JSON.stringify(result.summary, null, 2));
      
      console.log('\n📝 Documentation Update:');
      console.log('Updated Content Length:', result.documentation?.updatedContent?.length || 0);
      console.log('Changes:', result.documentation?.changeSummary || []);
      console.log('Sections Added:', result.documentation?.sectionsAdded || []);
      console.log('Breaking Changes:', result.documentation?.breakingChanges || false);
    } else {
      console.log('❌ Error:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Main execution
async function main() {
  const testType = process.argv[2];
  
  if (testType === 'single') {
    await testSinglePrompt();
  } else if (testType === 'compare') {
    await testPromptTemplates();
  } else {
    console.log('Usage: npm run test-prompts [single|compare]');
    console.log('  single  - Test a single prompt template');
    console.log('  compare - Compare multiple prompt templates');
  }
}

if (require.main === module) {
  main().catch(console.error);
}