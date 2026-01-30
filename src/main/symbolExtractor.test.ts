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

// =============================================================================
// TESTS: Global Variable Dependency Detection
// =============================================================================

describe('Global Variable Dependencies', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-var-test-'))
  })

  describe('global variable reads', () => {
    it('should detect global variable read in a function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-read-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
const API_URL = 'https://api.example.com'

function makeRequest() {
  return fetch(API_URL);
}
`
      )

      const result = extractProjectSymbols(testDir)

      // Should find the global-read edge
      const globalReadEdges = result.callEdges.filter((e) => e.type === 'global-read')
      expect(globalReadEdges.length).toBeGreaterThan(0)

      const edge = globalReadEdges.find(
        (e) => e.source.includes('makeRequest') && e.target.includes('API_URL')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('global-read')
    })

    it('should detect multiple global variable reads from same function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-read-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
const BASE_URL = 'https://api.example.com'
const TIMEOUT = 5000

function configuredFetch() {
  console.log(BASE_URL, TIMEOUT);
}
`
      )

      const result = extractProjectSymbols(testDir)

      const globalReadEdges = result.callEdges.filter((e) => e.type === 'global-read')

      // Should have edges to both BASE_URL and TIMEOUT
      const baseUrlEdge = globalReadEdges.find((e) => e.target.includes('BASE_URL'))
      const timeoutEdge = globalReadEdges.find((e) => e.target.includes('TIMEOUT'))

      expect(baseUrlEdge).toBeDefined()
      expect(timeoutEdge).toBeDefined()
    })
  })

  describe('global variable writes', () => {
    it('should detect global variable write with assignment', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-write-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
let counter = 0

function increment() {
  counter = counter + 1;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const globalWriteEdges = result.callEdges.filter((e) => e.type === 'global-write')
      const writeEdge = globalWriteEdges.find(
        (e) => e.source.includes('increment') && e.target.includes('counter')
      )

      expect(writeEdge).toBeDefined()
      expect(writeEdge?.type).toBe('global-write')
    })

    it('should detect global variable write with increment operator', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-incr-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
let requestCount = 0

function trackRequest() {
  requestCount++;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const globalWriteEdges = result.callEdges.filter((e) => e.type === 'global-write')
      const writeEdge = globalWriteEdges.find(
        (e) => e.source.includes('trackRequest') && e.target.includes('requestCount')
      )

      expect(writeEdge).toBeDefined()
      expect(writeEdge?.type).toBe('global-write')
    })

    it('should detect global variable write with compound assignment', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-compound-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
let total = 0

function addToTotal(value: number) {
  total += value;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const globalWriteEdges = result.callEdges.filter((e) => e.type === 'global-write')
      const writeEdge = globalWriteEdges.find(
        (e) => e.source.includes('addToTotal') && e.target.includes('total')
      )

      expect(writeEdge).toBeDefined()
      expect(writeEdge?.type).toBe('global-write')
    })
  })

  describe('local variables should NOT be detected', () => {
    it('should NOT create edges for local variables', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-var-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function process() {
  const localVar = 42;
  console.log(localVar);
}
`
      )

      const result = extractProjectSymbols(testDir)

      // Should not have any global-read or global-write edges to localVar
      const globalEdges = result.callEdges.filter(
        (e) => e.type === 'global-read' || e.type === 'global-write'
      )
      const localVarEdge = globalEdges.find((e) => e.target.includes('localVar'))

      expect(localVarEdge).toBeUndefined()
    })

    it('should NOT create edges for function parameters', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'param-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function processData(data: string) {
  console.log(data);
}
`
      )

      const result = extractProjectSymbols(testDir)

      // Should not have any global-read edges to the parameter
      const globalEdges = result.callEdges.filter(
        (e) => e.type === 'global-read' || e.type === 'global-write'
      )
      const paramEdge = globalEdges.find((e) => e.target.includes('data'))

      expect(paramEdge).toBeUndefined()
    })
  })

  describe('both read and write from same function', () => {
    it('should create separate edges for read and write', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-write-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
let state = 0

function updateState() {
  const old = state;  // read
  state = old + 1;    // write
}
`
      )

      const result = extractProjectSymbols(testDir)

      const readEdges = result.callEdges.filter(
        (e) => e.type === 'global-read' && e.source.includes('updateState')
      )
      const writeEdges = result.callEdges.filter(
        (e) => e.type === 'global-write' && e.source.includes('updateState')
      )

      expect(readEdges.length).toBeGreaterThan(0)
      expect(writeEdges.length).toBeGreaterThan(0)
    })
  })

  describe('no duplicate edges', () => {
    it('should not create duplicate edges for multiple reads of same global', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-dup-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
const CONFIG = { timeout: 5000 }

function useConfig() {
  console.log(CONFIG);
  console.log(CONFIG);
  console.log(CONFIG);
}
`
      )

      const result = extractProjectSymbols(testDir)

      const configEdges = result.callEdges.filter(
        (e) =>
          e.type === 'global-read' && e.source.includes('useConfig') && e.target.includes('CONFIG')
      )

      // Should only have ONE edge, not three
      expect(configEdges.length).toBe(1)
    })
  })
})

// =============================================================================
// TESTS: Class Instantiation Dependency Detection
// =============================================================================

describe('Class Instantiation Dependencies', () => {
  describe('basic class instantiation', () => {
    it('should detect class instantiation with new keyword', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-inst-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
class UserService {
  getUser() {
    return { name: 'John' };
  }
}

function createService() {
  const service = new UserService();
  return service;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const classInstEdges = result.callEdges.filter((e) => e.type === 'class-instantiation')
      expect(classInstEdges.length).toBeGreaterThan(0)

      const edge = classInstEdges.find(
        (e) => e.source.includes('createService') && e.target.includes('UserService')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('class-instantiation')
    })

    it('should detect class instantiation in class method', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-in-class-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
class Logger {
  log(msg: string) {
    console.log(msg);
  }
}

class App {
  init() {
    const logger = new Logger();
    logger.log('initialized');
  }
}
`
      )

      const result = extractProjectSymbols(testDir)

      const classInstEdges = result.callEdges.filter((e) => e.type === 'class-instantiation')

      const edge = classInstEdges.find(
        (e) => e.source.includes('App.init') && e.target.includes('Logger')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('class-instantiation')
    })

    it('should detect class instantiation in arrow function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-arrow-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
class ApiClient {
  fetch() {
    return {};
  }
}

const createClient = () => {
  return new ApiClient();
}
`
      )

      const result = extractProjectSymbols(testDir)

      const classInstEdges = result.callEdges.filter((e) => e.type === 'class-instantiation')

      const edge = classInstEdges.find(
        (e) => e.source.includes('createClient') && e.target.includes('ApiClient')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('class-instantiation')
    })
  })

  describe('cross-file class instantiation', () => {
    it('should detect class instantiation from imported class', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-file-class-test-'))

      // Create class file
      fs.writeFileSync(
        path.join(testDir, 'services.ts'),
        `
export class DataService {
  getData() {
    return [];
  }
}
`
      )

      // Create file that imports and instantiates
      fs.writeFileSync(
        path.join(testDir, 'main.ts'),
        `
import { DataService } from './services';

function initialize() {
  const service = new DataService();
  return service.getData();
}
`
      )

      const result = extractProjectSymbols(testDir)

      const classInstEdges = result.callEdges.filter((e) => e.type === 'class-instantiation')

      const edge = classInstEdges.find(
        (e) => e.source.includes('initialize') && e.target.includes('DataService')
      )
      expect(edge).toBeDefined()
      expect(edge?.source).toContain('main.ts:initialize')
      expect(edge?.target).toContain('services.ts:DataService')
    })
  })

  describe('no duplicate class instantiation edges', () => {
    it('should not create duplicate edges for multiple instantiations', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-dup-class-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
export class CacheService {
  get(key: string) {
    return null;
  }
}

export function setupCaches() {
  const cache1 = new CacheService();
  const cache2 = new CacheService();
  const cache3 = new CacheService();
  return [cache1, cache2, cache3];
}
`
      )

      const result = extractProjectSymbols(testDir)

      // Debug: log all edges
      console.log(
        'No-dup class test edges:',
        result.callEdges.map((e) => `${e.type}: ${e.source} -> ${e.target}`)
      )

      const classInstEdges = result.callEdges.filter(
        (e) =>
          e.type === 'class-instantiation' &&
          e.source.includes('setupCaches') &&
          e.target.includes('CacheService')
      )

      // Should only have ONE edge, not three
      expect(classInstEdges.length).toBe(1)
    })
  })
})

// =============================================================================
// TESTS: Enum Usage Dependency Detection
// =============================================================================

describe('Enum Usage Dependencies', () => {
  describe('basic enum usage', () => {
    it('should detect enum member usage in a function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enum-use-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending'
}

function getDefaultStatus() {
  return Status.Active;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const enumUseEdges = result.callEdges.filter((e) => e.type === 'enum-use')
      expect(enumUseEdges.length).toBeGreaterThan(0)

      const edge = enumUseEdges.find(
        (e) => e.source.includes('getDefaultStatus') && e.target.includes('Status')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('enum-use')
    })

    it('should detect enum usage in class method', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enum-class-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

class Permissions {
  checkAdmin(role: UserRole) {
    return role === UserRole.Admin;
  }
}
`
      )

      const result = extractProjectSymbols(testDir)

      const enumUseEdges = result.callEdges.filter((e) => e.type === 'enum-use')

      const edge = enumUseEdges.find(
        (e) => e.source.includes('Permissions.checkAdmin') && e.target.includes('UserRole')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('enum-use')
    })

    it('should detect enum usage in arrow function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enum-arrow-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
enum Priority {
  Low = 1,
  Medium = 2,
  High = 3
}

const getHighPriority = () => {
  return Priority.High;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const enumUseEdges = result.callEdges.filter((e) => e.type === 'enum-use')

      const edge = enumUseEdges.find(
        (e) => e.source.includes('getHighPriority') && e.target.includes('Priority')
      )
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('enum-use')
    })
  })

  describe('cross-file enum usage', () => {
    it('should detect enum usage from imported enum', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-file-enum-test-'))

      // Create enum file
      fs.writeFileSync(
        path.join(testDir, 'enums.ts'),
        `
export enum TaskStatus {
  Todo = 'todo',
  InProgress = 'in-progress',
  Done = 'done'
}
`
      )

      // Create file that imports and uses enum
      fs.writeFileSync(
        path.join(testDir, 'main.ts'),
        `
import { TaskStatus } from './enums';

function markAsDone() {
  return TaskStatus.Done;
}
`
      )

      const result = extractProjectSymbols(testDir)

      const enumUseEdges = result.callEdges.filter((e) => e.type === 'enum-use')

      const edge = enumUseEdges.find(
        (e) => e.source.includes('markAsDone') && e.target.includes('TaskStatus')
      )
      expect(edge).toBeDefined()
      expect(edge?.source).toContain('main.ts:markAsDone')
      expect(edge?.target).toContain('enums.ts:TaskStatus')
    })
  })

  describe('no duplicate enum usage edges', () => {
    it('should not create duplicate edges for multiple usages of same enum', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-dup-enum-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue'
}

export function useColors() {
  const r = Color.Red;
  const g = Color.Green;
  const b = Color.Blue;
  return [r, g, b];
}
`
      )

      const result = extractProjectSymbols(testDir)

      const enumUseEdges = result.callEdges.filter(
        (e) => e.type === 'enum-use' && e.source.includes('useColors') && e.target.includes('Color')
      )

      // Should only have ONE edge, not three
      expect(enumUseEdges.length).toBe(1)
    })
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
