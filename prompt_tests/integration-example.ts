#!/usr/bin/env node

import { createDocumentationService } from '../src/documentation-service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Integration example demonstrating the summarizer → doc-writer chain
 * This shows how the two agents work together to process code changes
 */

async function demonstrateChaining() {
  console.log('🔗 Demonstrating Agent Chaining: Summarizer → Doc Writer\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const docService = createDocumentationService(apiKey);

  // Example: Real code changes from git.ts
  const codeChanges = {
    filename: 'src/git.ts',
    filePurpose: 'Git integration module that handles repository operations and diff generation',
    diffContent: readFileSync(join(__dirname, 'mock_inputs/git-diff-sample.txt'), 'utf-8'),
    projectDir: process.cwd(),
    docType: 'readme' as const,
    targetAudience: 'developers' as const
  };

  console.log('📁 Input Code Changes:');
  console.log(`- File: ${codeChanges.filename}`);
  console.log(`- Purpose: ${codeChanges.filePurpose}`);
  console.log(`- Diff Length: ${codeChanges.diffContent.length} characters`);
  console.log(`- Doc Type: ${codeChanges.docType}`);
  console.log(`- Target Audience: ${codeChanges.targetAudience}\n`);

  try {
    // Step 1: The service will automatically chain the agents
    console.log('⚙️  Processing through agent chain...\n');
    
    const result = await docService.updateDocumentation(codeChanges);

    if (result.success) {
      console.log('✅ Agent chaining completed successfully!\n');
      
      // Show summarizer output
      console.log('📋 STEP 1: Summarizer Agent Results:');
      console.log('─'.repeat(50));
      console.log(`Change Type: ${result.summary.change_type}`);
      console.log(`Key Changes: ${result.summary.key_changes?.join(', ')}`);
      console.log(`Impact Areas: ${result.summary.impact_areas?.join(', ')}`);
      console.log(`New Dependencies: ${result.summary.new_dependencies?.join(', ') || 'None'}`);
      console.log(`Breaking Changes: ${result.summary.breaking_changes?.join(', ') || 'None'}`);
      
      if (result.summary.documentation_recommendations) {
        console.log('\n📝 Documentation Recommendations:');
        Object.entries(result.summary.documentation_recommendations).forEach(([key, value]) => {
          if (value) console.log(`  ${key}: ${value}`);
        });
      }
      
      // Show doc writer output
      console.log('\n\n📝 STEP 2: Doc Writer Agent Results:');
      console.log('─'.repeat(50));
      console.log(`Updated Content Length: ${result.documentation.updatedContent?.length || 0} characters`);
      console.log(`Changes Made: ${result.documentation.changeSummary?.length || 0} items`);
      console.log(`Sections Added: ${result.documentation.sectionsAdded?.join(', ') || 'None'}`);
      console.log(`Sections Removed: ${result.documentation.sectionsRemoved?.join(', ') || 'None'}`);
      console.log(`Breaking Changes Detected: ${result.documentation.breakingChanges ? 'Yes' : 'No'}`);
      
      if (result.documentation.changeSummary?.length > 0) {
        console.log('\n📋 Change Summary:');
        result.documentation.changeSummary.forEach((change, index) => {
          console.log(`  ${index + 1}. ${change}`);
        });
      }
      
      // Show a sample of the updated content
      if (result.documentation.updatedContent) {
        console.log('\n📄 Sample Updated Content (first 300 chars):');
        console.log('─'.repeat(50));
        console.log(result.documentation.updatedContent.substring(0, 300) + '...');
      }
      
    } else {
      console.log('❌ Agent chaining failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
  }
}

/**
 * A/B test different prompt templates to show the difference
 */
async function demonstrateABTesting() {
  console.log('\n\n🧪 A/B Testing Different Prompt Templates\n');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const docService = createDocumentationService(apiKey);

  const testInput = {
    filename: 'src/agents/agent.ts',
    filePurpose: 'Core agent class that provides AI chat capabilities with tool calling support',
    diffContent: readFileSync(join(__dirname, 'mock_inputs/agent-diff-sample.txt'), 'utf-8'),
    projectDir: process.cwd(),
    docType: 'readme' as const,
    targetAudience: 'developers' as const
  };

  const templatePairs = [
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

  console.log('📊 Comparing template performance...\n');

  const results = await docService.testTemplates(testInput, templatePairs);

  results.forEach((result, index) => {
    console.log(`\n📋 Test ${index + 1}: ${result.name}`);
    console.log('─'.repeat(40));
    
    if (result.result.success) {
      console.log('✅ Status: Success');
      console.log(`📊 Summary Quality: ${result.result.summary.key_changes?.length || 0} key changes identified`);
      console.log(`📝 Doc Updates: ${result.result.documentation.changeSummary?.length || 0} changes`);
      
      if (result.metrics.summarizer.completeness) {
        console.log(`🎯 Summarizer Completeness: ${(result.metrics.summarizer.completeness * 100).toFixed(1)}%`);
      }
      if (result.metrics.summarizer.responseTime) {
        console.log(`⏱️  Summarizer Response Time: ${result.metrics.summarizer.responseTime}ms`);
      }
      
    } else {
      console.log('❌ Status: Failed');
      console.log(`Error: ${result.result.error}`);
    }
  });

  // Show comparison
  console.log('\n📈 Performance Comparison:');
  console.log('─'.repeat(50));
  const comparison = docService.getTemplateComparison([
    'summarizer-v1.0', 'summarizer-v1.1',
    'doc-writer-v1.0', 'doc-writer-v1.1'
  ]);
  
  Object.entries(comparison).forEach(([templateId, data]) => {
    console.log(`\n${templateId}:`);
    console.log(`  Tests: ${data.testCount}`);
    if (data.averageMetrics) {
      console.log(`  Avg Completeness: ${(data.averageMetrics.completeness * 100).toFixed(1)}%`);
      console.log(`  Avg Response Time: ${Math.round(data.averageMetrics.responseTime)}ms`);
    }
  });
}

// Main execution
async function main() {
  await demonstrateChaining();
  await demonstrateABTesting();
}

if (require.main === module) {
  main().catch(console.error);
}