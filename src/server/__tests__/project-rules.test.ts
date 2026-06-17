import { describe, it, expect, mock, beforeEach } from 'bun:test'
import * as path from 'path'

// Mock dependencies
mock.module('../../utils/envUtils.js', () => ({
  getClaudeConfigHomeDir: () => '/mock/home/.claude',
}))

mock.module('../../utils/cwd.js', () => ({
  getCwd: () => '/mock/project',
}))

const mockFiles = new Set<string>()
const mockDirs = new Map<string, string[]>()

mock.module('fs/promises', () => ({
  access: async (filePath: string) => {
    if (!mockFiles.has(filePath)) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
  },
  mkdir: async () => {},
  writeFile: async (filePath: string) => {
    mockFiles.add(filePath)
  },
  readdir: async (dirPath: string, _opts?: unknown) => {
    const files = mockDirs.get(dirPath) ?? []
    return files.map(name => ({ name, isFile: () => true }))
  },
}))

import { handleProjectRulesApi } from '../api/project-rules'

function makeReq(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/project-rules', {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

type RuleFile = { path: string; exists: boolean; type: string; label: string }

describe('project-rules API', () => {
  beforeEach(() => {
    mockFiles.clear()
    mockDirs.clear()
  })

  it('GET /api/project-rules returns all file locations with existence status', async () => {
    const url = new URL('http://localhost/api/project-rules?cwd=/mock/project')
    const res = await handleProjectRulesApi(
      makeReq('GET'),
      url,
      ['api', 'project-rules'],
    )
    const data = await res.json() as { files: RuleFile[]; cwd: string }

    expect(data.cwd).toBe('/mock/project')
    expect(data.files.length).toBeGreaterThanOrEqual(4)
    // Should include root CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, user CLAUDE.md
    const labels = data.files.map(f => f.label)
    expect(labels).toContain('CLAUDE.md')
    expect(labels).toContain('.claude/CLAUDE.md')
    expect(labels).toContain('CLAUDE.local.md')
    expect(labels).toContain('~/.claude/CLAUDE.md')
  })

  it('GET /api/project-rules shows existing files as exists=true', async () => {
    const rootPath = path.join('/mock/project', 'CLAUDE.md')
    mockFiles.add(rootPath)

    const url = new URL('http://localhost/api/project-rules?cwd=/mock/project')
    const res = await handleProjectRulesApi(
      makeReq('GET'),
      url,
      ['api', 'project-rules'],
    )
    const data = await res.json() as { files: RuleFile[] }

    const rootFile = data.files.find(f => f.label === 'CLAUDE.md')
    expect(rootFile?.exists).toBe(true)
  })

  it('GET /api/project-rules includes .claude/rules/ files', async () => {
    const rulesDir = path.join('/mock/project', '.claude', 'rules')
    mockDirs.set(rulesDir, ['codegraph.md', 'style.md'])

    const url = new URL('http://localhost/api/project-rules?cwd=/mock/project')
    const res = await handleProjectRulesApi(
      makeReq('GET'),
      url,
      ['api', 'project-rules'],
    )
    const data = await res.json() as { files: RuleFile[] }

    const ruleLabels = data.files.filter(f => f.label.startsWith('.claude/rules/')).map(f => f.label)
    expect(ruleLabels).toContain('.claude/rules/codegraph.md')
    expect(ruleLabels).toContain('.claude/rules/style.md')
  })

  it('POST /api/project-rules/create creates user file', async () => {
    const url = new URL('http://localhost/api/project-rules/create')
    const res = await handleProjectRulesApi(
      new Request('http://localhost/api/project-rules/create', {
        method: 'POST',
        body: JSON.stringify({ scope: 'user' }),
      }),
      url,
      ['api', 'project-rules', 'create'],
    )
    const data = await res.json() as { ok: boolean; created: boolean; path: string }

    expect(data.ok).toBe(true)
    expect(data.created).toBe(true)
    expect(data.path).toContain('CLAUDE.md')
  })

  it('POST /api/project-rules/create with invalid scope returns 400', async () => {
    const url = new URL('http://localhost/api/project-rules/create')
    const res = await handleProjectRulesApi(
      new Request('http://localhost/api/project-rules/create', {
        method: 'POST',
        body: JSON.stringify({ scope: 'invalid' }),
      }),
      url,
      ['api', 'project-rules', 'create'],
    )

    expect(res.status).toBe(400)
  })

  it('POST /api/project-rules/create does not overwrite existing file', async () => {
    const userPath = path.join('/mock/home/.claude', 'CLAUDE.md')
    mockFiles.add(userPath)

    const url = new URL('http://localhost/api/project-rules/create')
    const res = await handleProjectRulesApi(
      new Request('http://localhost/api/project-rules/create', {
        method: 'POST',
        body: JSON.stringify({ scope: 'user' }),
      }),
      url,
      ['api', 'project-rules', 'create'],
    )
    const data = await res.json() as { ok: boolean; created: boolean }

    expect(data.ok).toBe(true)
    expect(data.created).toBe(false)
  })

  it('POST /api/project-rules/create project-root creates CLAUDE.md at project root', async () => {
    const url = new URL('http://localhost/api/project-rules/create')
    const res = await handleProjectRulesApi(
      new Request('http://localhost/api/project-rules/create', {
        method: 'POST',
        body: JSON.stringify({ scope: 'project-root', cwd: '/mock/project' }),
      }),
      url,
      ['api', 'project-rules', 'create'],
    )
    const data = await res.json() as { ok: boolean; created: boolean; path: string }

    expect(data.ok).toBe(true)
    expect(data.created).toBe(true)
    expect(data.path).toBe(path.join('/mock/project', 'CLAUDE.md'))
  })
})
