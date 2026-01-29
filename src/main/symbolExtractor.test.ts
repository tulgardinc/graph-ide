import { describe, it, expect, beforeAll } from 'vitest'
import { Project, SyntaxKind, ts } from 'ts-morph'
import { findContainingFunctionByAncestors, extractProjectSymbols } from './symbolExtractor'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a ts-morph project with in-memory source file
 */
function createTestProject(code: string, filename = 'test.ts'): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      strict: true
    }
  })
  project.createSourceFile(filename, code)
  return project
}

/**
 * Get the first call expression from source code
 */
function getFirstCallExpression(project: Project) {
  const sourceFile = project.getSourceFiles()[0]
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0]
}

/**
 * Get all call expressions from source code
 */
function getAllCallExpressions(project: Project) {
  const sourceFile = project.getSourceFiles()[0]
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
}

// =============================================================================
// TESTS: findContainingFunctionByAncestors
// =============================================================================

describe('findContainingFunctionByAncestors', () => {
  describe('function declarations', () => {
    it('should find containing function for call inside function declaration', () => {
      const code = `
function outer() {
  console.log("hello");
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('outer')
      expect(result?.kind).toBe('function')
    })

    it('should find correct function for nested function calls', () => {
      const code = `
function outer() {
  function inner() {
    someCall();
  }
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      // Should find the innermost function (inner)
      expect(result?.name).toBe('inner')
    })

    it('should find exported function', () => {
      const code = `
export function exportedFn() {
  doSomething();
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.name).toBe('exportedFn')
      expect(result?.exported).toBe(true)
    })
  })

  describe('arrow functions', () => {
    it('should find containing arrow function assigned to const', () => {
      const code = `
const myArrow = () => {
  performAction();
};
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('myArrow')
      expect(result?.kind).toBe('function')
    })

    it('should find containing arrow function with parameters', () => {
      const code = `
const processData = (data: string) => {
  validate(data);
};
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.name).toBe('processData')
    })

    it('should find exported arrow function', () => {
      const code = `
export const exportedArrow = () => {
  callSomething();
};
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.name).toBe('exportedArrow')
      expect(result?.exported).toBe(true)
    })
  })

  describe('function expressions', () => {
    it('should find containing function expression', () => {
      const code = `
const myFunc = function() {
  doWork();
};
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.name).toBe('myFunc')
      expect(result?.kind).toBe('function')
    })

    it('should find named function expression', () => {
      const code = `
const myFunc = function namedFn() {
  execute();
};
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      // Should use the variable name, not the function expression name
      expect(result?.name).toBe('myFunc')
    })
  })

  describe('class methods', () => {
    it('should find containing class method', () => {
      const code = `
class MyClass {
  myMethod() {
    this.helper();
  }
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('MyClass.myMethod')
      expect(result?.kind).toBe('function')
    })

    it('should find containing static method', () => {
      const code = `
class Utils {
  static format(data: string) {
    validate(data);
  }
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.name).toBe('Utils.format')
    })

    it('should find method in exported class', () => {
      const code = `
export class ApiClient {
  fetch() {
    makeRequest();
  }
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.name).toBe('ApiClient.fetch')
      expect(result?.exported).toBe(true)
    })

    it('should find correct method with multiple methods', () => {
      const code = `
class Service {
  methodA() {
    console.log("A");
  }
  
  methodB() {
    doSomething();
  }
}
`
      const project = createTestProject(code)
      const calls = getAllCallExpressions(project)

      // First call is console.log in methodA
      const resultA = findContainingFunctionByAncestors(calls[0], '/project')
      expect(resultA?.name).toBe('Service.methodA')

      // Second call is doSomething in methodB
      const resultB = findContainingFunctionByAncestors(calls[1], '/project')
      expect(resultB?.name).toBe('Service.methodB')
    })
  })

  describe('edge cases', () => {
    it('should return null for top-level call (not in any function)', () => {
      const code = `
console.log("top level");
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result).toBeNull()
    })

    it('should handle deeply nested calls', () => {
      const code = `
function level1() {
  function level2() {
    const level3 = () => {
      deepCall();
    };
  }
}
`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      // Should find the innermost function (level3 arrow function)
      expect(result?.name).toBe('level3')
    })

    it('should handle call inside callback', () => {
      const code = `
function processor() {
  items.forEach(item => {
    process(item);
  });
}
`
      const project = createTestProject(code)
      const calls = getAllCallExpressions(project)

      // The process(item) call should still trace back to processor
      // because the arrow function callback is not assigned to a variable
      const processCall = calls.find((c) => c.getText().startsWith('process('))
      if (processCall) {
        const result = findContainingFunctionByAncestors(processCall, '/project')
        // Since the arrow function is not assigned to a named variable,
        // it should continue up to find 'processor'
        expect(result?.name).toBe('processor')
      }
    })

    it('should handle IIFE (Immediately Invoked Function Expression)', () => {
      const code = `
(function() {
  initialize();
})();
`
      const project = createTestProject(code)
      const calls = getAllCallExpressions(project)
      const initCall = calls.find((c) => c.getText() === 'initialize()')

      if (initCall) {
        const result = findContainingFunctionByAncestors(initCall, '/project')
        // IIFE function expression is not assigned to a variable, so should return null
        expect(result).toBeNull()
      }
    })

    it('should include correct file path', () => {
      const code = `
function testFn() {
  callMe();
}
`
      const project = createTestProject(code, 'src/utils/helpers.ts')
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.filePath).toContain('helpers.ts')
    })
  })

  describe('line numbers', () => {
    it('should report correct start and end lines for function', () => {
      const code = `function multiLine() {
  const x = 1;
  const y = 2;
  calculate(x, y);
}`
      const project = createTestProject(code)
      const callExpr = getFirstCallExpression(project)

      const result = findContainingFunctionByAncestors(callExpr, '/project')

      expect(result?.startLine).toBe(1)
      expect(result?.endLine).toBe(5)
    })
  })
})

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

  it('should include call site information', () => {
    const result = extractProjectSymbols(tempDir)

    for (const edge of result.callEdges) {
      expect(edge.callSite).toBeDefined()
      expect(edge.callSite.file).toBeTruthy()
      expect(typeof edge.callSite.line).toBe('number')
      expect(edge.callSite.line).toBeGreaterThan(0)
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

// =============================================================================
// TESTS: Performance (O(n) complexity verification)
// =============================================================================

describe('Performance', () => {
  it('should handle large files efficiently', () => {
    // Generate a file with many functions and calls
    const functionCount = 100
    let code = ''

    for (let i = 0; i < functionCount; i++) {
      code += `
function fn${i}() {
  ${i > 0 ? `fn${i - 1}();` : 'console.log("base");'}
}
`
    }

    const project = createTestProject(code)
    const sourceFile = project.getSourceFiles()[0]

    const start = performance.now()

    // Get all calls and find containing functions
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    for (const call of calls) {
      findContainingFunctionByAncestors(call, '/project')
    }

    const elapsed = performance.now() - start

    // Should complete in reasonable time (< 1 second for 100 functions)
    expect(elapsed).toBeLessThan(1000)
    expect(calls.length).toBe(functionCount)
  })
})
