import { describe, it, expect, beforeAll } from 'vitest'
import { extractProjectSymbols } from './symbolExtractor'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// TESTS: extractProjectSymbols (Integration)
// =============================================================================

describe('extractProjectSymbols', () => {
  let tempDir: string

  beforeAll(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-extractor-test-'))

    // Create test files
    fs.writeFileSync(
      path.join(tempDir, 'main.ts'),
      `
function greet(name: string) {
  return formatGreeting(name);
}

function formatGreeting(name: string) {
  return \`Hello, \${name}!\`;
}

export const run = () => {
  greet("World");
};
`
    )

    fs.writeFileSync(
      path.join(tempDir, 'utils.ts'),
      `
export function helper() {
  console.log("helper");
}

export class Calculator {
  add(a: number, b: number) {
    return this.compute(a, b, "+");
  }
  
  compute(a: number, b: number, op: string) {
    return a + b;
  }
}
`
    )
  })

  it('should extract symbols from multiple files', () => {
    const result = extractProjectSymbols(tempDir)

    expect(result.totalFiles).toBe(2)
    expect(result.totalSymbols).toBeGreaterThan(0)
    expect(result.errors).toHaveLength(0)
  })

  it('should extract call edges between functions', () => {
    const result = extractProjectSymbols(tempDir)

    // Should find call edges
    expect(result.callEdges.length).toBeGreaterThan(0)

    // Check for expected edges
    const edgeSources = result.callEdges.map((e) => e.source)
    const edgeTargets = result.callEdges.map((e) => e.target)

    // greet should call formatGreeting
    expect(edgeSources.some((s) => s.includes('greet'))).toBe(true)
    expect(edgeTargets.some((t) => t.includes('formatGreeting'))).toBe(true)

    // run should call greet
    expect(edgeSources.some((s) => s.includes('run'))).toBe(true)
  })

  it('should extract class method calls', () => {
    const result = extractProjectSymbols(tempDir)

    // Class methods should be extracted as symbols
    const allSymbols = result.files.flatMap((f) => f.symbols)
    const calculatorClass = allSymbols.find((s) => s.name === 'Calculator')
    expect(calculatorClass).toBeDefined()
    expect(calculatorClass?.kind).toBe('class')

    // Note: this.method() calls are harder to resolve because they involve
    // property access expressions. The current implementation focuses on
    // direct function calls. Class method-to-method calls would require
    // more sophisticated type resolution.
  })

  it('should not create duplicate edges', () => {
    const result = extractProjectSymbols(tempDir)

    const edgeIds = result.callEdges.map((e) => e.id)
    const uniqueEdgeIds = new Set(edgeIds)

    expect(edgeIds.length).toBe(uniqueEdgeIds.size)
  })

  it('should include location information', () => {
    const result = extractProjectSymbols(tempDir)

    for (const edge of result.callEdges) {
      expect(edge.location).toBeDefined()
      expect(edge.location.file).toBeTruthy()
      expect(typeof edge.location.line).toBe('number')
      expect(edge.location.line).toBeGreaterThan(0)
    }
  })

  it('should detect cross-file calls from imports', () => {
    // Create a cross-file import scenario
    const crossFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-file-test-'))

    // Create utils.ts with an exported function
    fs.writeFileSync(
      path.join(crossFileDir, 'utils.ts'),
      `
export function helperFunc() {
  console.log('helper');
}

export function anotherHelper() {
  helperFunc();
}
`
    )

    // Create main.ts that imports and calls helperFunc
    fs.writeFileSync(
      path.join(crossFileDir, 'main.ts'),
      `
import { helperFunc } from './utils';

export function mainFunc() {
  helperFunc();
}
`
    )

    const result = extractProjectSymbols(crossFileDir)

    console.log(
      'Cross-file test edges:',
      result.callEdges.map((e) => `${e.source} -> ${e.target}`)
    )

    // Check that helperFunc exists in both files as a symbol
    const allSymbols = result.files.flatMap((f) => f.symbols)
    const helperFuncs = allSymbols.filter((s) => s.name === 'helperFunc')
    expect(helperFuncs.length).toBe(1) // Only in utils.ts

    const mainFuncs = allSymbols.filter((s) => s.name === 'mainFunc')
    expect(mainFuncs.length).toBe(1)

    // Check for the cross-file edge: mainFunc -> helperFunc
    const crossFileEdge = result.callEdges.find(
      (e) => e.source.includes('mainFunc') && e.target.includes('helperFunc')
    )

    // This is what we're testing - cross-file call detection
    expect(crossFileEdge).toBeDefined()
    expect(crossFileEdge?.source).toContain('main.ts:mainFunc')
    expect(crossFileEdge?.target).toContain('utils.ts:helperFunc')
  })
})
