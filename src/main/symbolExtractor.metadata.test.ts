import { describe, it, expect } from 'vitest'
import { extractProjectSymbols } from './symbolExtractor'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

// =============================================================================
// TESTS: Metadata Extraction (JSDoc, Parameters, Return Types)
// =============================================================================

describe('Metadata Extraction', () => {
  describe('JSDoc description extraction', () => {
    it('should extract JSDoc description from function declaration', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-func-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * Calculates the sum of two numbers
 */
function add(a: number, b: number): number {
  return a + b;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'add')

      expect(symbol).toBeDefined()
      expect(symbol?.description).toBe('Calculates the sum of two numbers')
    })

    it('should extract JSDoc description from arrow function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-arrow-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * Multiplies two numbers together
 */
const multiply = (a: number, b: number): number => {
  return a * b;
};
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'multiply')

      expect(symbol).toBeDefined()
      expect(symbol?.description).toBe('Multiplies two numbers together')
    })

    it('should extract JSDoc description from class', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-class-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * Service for managing user operations
 */
export class UserService {
  getUsers() {
    return [];
  }
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'UserService')

      expect(symbol).toBeDefined()
      expect(symbol?.kind).toBe('class')
      expect(symbol?.description).toBe('Service for managing user operations')
    })

    it('should extract JSDoc description from interface', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-iface-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * Represents a user in the system
 */
export interface User {
  id: string;
  name: string;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'User')

      expect(symbol).toBeDefined()
      expect(symbol?.kind).toBe('interface')
      expect(symbol?.description).toBe('Represents a user in the system')
    })

    it('should extract JSDoc description from type alias', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-type-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * Valid user roles in the application
 */
export type UserRole = 'admin' | 'user' | 'guest';
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'UserRole')

      expect(symbol).toBeDefined()
      expect(symbol?.kind).toBe('type')
      expect(symbol?.description).toBe('Valid user roles in the application')
    })

    it('should extract JSDoc description from enum', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsdoc-enum-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * Possible status values for a task
 */
export enum TaskStatus {
  Todo = 'todo',
  InProgress = 'in-progress',
  Done = 'done'
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'TaskStatus')

      expect(symbol).toBeDefined()
      expect(symbol?.kind).toBe('enum')
      expect(symbol?.description).toBe('Possible status values for a task')
    })

    it('should handle missing JSDoc gracefully', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-jsdoc-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function noDoc(x: number): number {
  return x * 2;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'noDoc')

      expect(symbol).toBeDefined()
      expect(symbol?.description).toBeUndefined()
    })
  })

  describe('function parameters extraction', () => {
    it('should extract parameters from function declaration', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'params-func-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function greet(name: string, age: number): string {
  return \`Hello \${name}, you are \${age}\`;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'greet')

      expect(symbol).toBeDefined()
      expect(symbol?.parameters).toBeDefined()
      expect(symbol?.parameters).toHaveLength(2)
      expect(symbol?.parameters?.[0].name).toBe('name')
      expect(symbol?.parameters?.[0].typeText).toBe('string')
      expect(symbol?.parameters?.[1].name).toBe('age')
      expect(symbol?.parameters?.[1].typeText).toBe('number')
    })

    it('should extract parameters from arrow function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'params-arrow-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
const calculate = (x: number, y: number, operation: string): number => {
  return x + y;
};
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'calculate')

      expect(symbol).toBeDefined()
      expect(symbol?.parameters).toHaveLength(3)
      expect(symbol?.parameters?.[0].name).toBe('x')
      expect(symbol?.parameters?.[1].name).toBe('y')
      expect(symbol?.parameters?.[2].name).toBe('operation')
    })

    it('should extract parameter typeId when referencing project type', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'params-typeid-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
interface User {
  id: string;
  name: string;
}

function processUser(user: User): void {
  console.log(user.name);
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'processUser')

      expect(symbol).toBeDefined()
      expect(symbol?.parameters).toHaveLength(1)
      expect(symbol?.parameters?.[0].name).toBe('user')
      expect(symbol?.parameters?.[0].typeText).toBe('User')
      expect(symbol?.parameters?.[0].typeId).toContain('User')
    })

    it('should handle function with no parameters', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-params-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function noParams(): void {
  console.log('no params');
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'noParams')

      expect(symbol).toBeDefined()
      expect(symbol?.parameters).toBeUndefined()
    })
  })

  describe('return type extraction', () => {
    it('should extract return type text from function declaration', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'return-func-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function getCount(): number {
  return 42;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'getCount')

      expect(symbol).toBeDefined()
      expect(symbol?.returnTypeText).toBe('number')
    })

    it('should extract return type text from arrow function', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'return-arrow-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
const getMessage = (): string => {
  return 'hello';
};
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'getMessage')

      expect(symbol).toBeDefined()
      expect(symbol?.returnTypeText).toBe('string')
    })

    it('should extract return typeId when referencing project type', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'return-typeid-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
interface User {
  id: string;
  name: string;
}

function getUser(): User {
  return { id: '1', name: 'John' };
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'getUser')

      expect(symbol).toBeDefined()
      expect(symbol?.returnTypeText).toBe('User')
      expect(symbol?.returnTypeId).toContain('User')
    })

    it('should handle function with no explicit return type', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-return-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
function noExplicitReturn() {
  return 42;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'noExplicitReturn')

      expect(symbol).toBeDefined()
      expect(symbol?.returnTypeText).toBeUndefined()
      expect(symbol?.returnTypeId).toBeUndefined()
    })
  })

  describe('cross-file type references', () => {
    it('should resolve parameter typeId from imported type', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-file-param-test-'))

      // Create types file
      fs.writeFileSync(
        path.join(testDir, 'types.ts'),
        `
export interface User {
  id: string;
  name: string;
}
`
      )

      // Create main file that imports and uses type
      fs.writeFileSync(
        path.join(testDir, 'main.ts'),
        `
import { User } from './types';

export function createUser(data: User): User {
  return data;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const mainFile = result.files.find((f) => f.filePath.includes('main.ts'))
      const symbol = mainFile?.symbols.find((s) => s.name === 'createUser')

      expect(symbol).toBeDefined()

      // Parameter should reference types.ts:User
      expect(symbol?.parameters).toHaveLength(1)
      expect(symbol?.parameters?.[0].typeId).toContain('types.ts:User')

      // Return type should also reference types.ts:User
      expect(symbol?.returnTypeId).toContain('types.ts:User')
    })
  })

  describe('metadata for non-function symbols', () => {
    it('should not have parameters or returnType for class', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-no-func-meta-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * A simple class
 */
export class MyClass {
  value: number = 0;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'MyClass')

      expect(symbol).toBeDefined()
      expect(symbol?.description).toBe('A simple class')
      expect(symbol?.parameters).toBeUndefined()
      expect(symbol?.returnTypeId).toBeUndefined()
      expect(symbol?.returnTypeText).toBeUndefined()
    })

    it('should not have parameters or returnType for interface', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iface-no-func-meta-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * A data interface
 */
export interface Data {
  value: string;
}
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'Data')

      expect(symbol).toBeDefined()
      expect(symbol?.description).toBe('A data interface')
      expect(symbol?.parameters).toBeUndefined()
      expect(symbol?.returnTypeId).toBeUndefined()
    })

    it('should not have parameters or returnType for constant', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'const-no-func-meta-test-'))
      fs.writeFileSync(
        path.join(testDir, 'test.ts'),
        `
/**
 * API endpoint URL
 */
export const API_URL = 'https://api.example.com';
`
      )

      const result = extractProjectSymbols(testDir)
      const symbol = result.files[0].symbols.find((s) => s.name === 'API_URL')

      expect(symbol).toBeDefined()
      expect(symbol?.kind).toBe('constant')
      expect(symbol?.description).toBe('API endpoint URL')
      expect(symbol?.parameters).toBeUndefined()
      expect(symbol?.returnTypeId).toBeUndefined()
    })
  })
})
