/**
 * Test script for symbol extraction
 * Run with: node test-extractor.mjs
 */
import { extractProjectSymbols, formatProjectSymbols } from './out/main/symbolExtractor.js'

const testProjectPath = './test-project'

console.log('='.repeat(60))
console.log('Testing Symbol Extractor')
console.log('='.repeat(60))
console.log(`Project path: ${testProjectPath}`)
console.log('')

try {
  const result = extractProjectSymbols(testProjectPath)
  console.log(formatProjectSymbols(result))
} catch (error) {
  console.error('Error:', error)
}
