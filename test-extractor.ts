/**
 * Test script for ts-morph symbol extraction and call graph
 * Run with: npx tsx test-extractor.ts
 */
import { extractProjectSymbols, formatProjectSymbols } from './src/main/symbolExtractor'

const testProjectPath = './test-project'

console.log('='.repeat(60))
console.log('Testing ts-morph Symbol Extractor with Call Graph')
console.log('='.repeat(60))
console.log(`Project path: ${testProjectPath}`)
console.log('')

try {
  const result = extractProjectSymbols(testProjectPath)
  console.log(formatProjectSymbols(result))

  // Additional call graph summary
  console.log('')
  console.log('='.repeat(60))
  console.log('Call Graph Summary')
  console.log('='.repeat(60))
  console.log(`Total symbols: ${result.totalSymbols}`)
  console.log(`Total call edges: ${result.callEdges.length}`)

  if (result.callEdges.length > 0) {
    console.log('\nCall relationships found:')
    result.callEdges.forEach((edge, i) => {
      const caller = edge.source.split(':').pop()
      const callee = edge.target.split(':').pop()
      console.log(`  ${i + 1}. ${caller}() → ${callee}()`)
    })
  } else {
    console.log('\nNo call relationships found between project symbols.')
  }
} catch (error) {
  console.error('Error:', error)
}
