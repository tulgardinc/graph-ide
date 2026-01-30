import { describe, it, expect } from 'vitest'
import { extractProjectSymbols } from './symbolExtractor'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// TESTS: Global Variable Dependency Detection
// =============================================================================

describe('Global Variable Dependencies', () => {
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
