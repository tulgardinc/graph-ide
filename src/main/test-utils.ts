import { Project, SyntaxKind, ts } from 'ts-morph'

/**
 * Create a ts-morph project with in-memory source file
 */
export function createTestProject(code: string, filename = 'test.ts'): Project {
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
export function getFirstCallExpression(project: Project) {
  const sourceFile = project.getSourceFiles()[0]
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0]
}

/**
 * Get all call expressions from source code
 */
export function getAllCallExpressions(project: Project) {
  const sourceFile = project.getSourceFiles()[0]
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
}
