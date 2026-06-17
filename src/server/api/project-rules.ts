/**
 * Project Rules (CLAUDE.md) REST API
 *
 * GET  /api/project-rules       — Get all CLAUDE.md file paths and existence status
 * POST /api/project-rules/create — Create a CLAUDE.md file if it doesn't exist
 *
 * Scans the same locations the system actually loads:
 *  - Project root: CLAUDE.md, .claude/CLAUDE.md, .claude/rules/*.md, CLAUDE.local.md
 *  - User level: ~/.claude/CLAUDE.md, ~/.claude/rules/*.md
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getCwd } from '../../utils/cwd.js'

type RuleFile = {
  path: string
  exists: boolean
  type: 'project' | 'user' | 'local'
  label: string
}

export async function handleProjectRulesApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  const sub = segments[2]

  if (req.method === 'GET' && !sub) {
    return await getProjectRules(url)
  }

  if (req.method === 'POST' && sub === 'create') {
    return await createProjectRulesFile(req, url)
  }

  return Response.json(
    { error: 'Not Found', message: `Unknown project-rules endpoint` },
    { status: 404 },
  )
}

async function getProjectRules(url: URL): Promise<Response> {
  const cwd = url.searchParams.get('cwd') || getCwd()
  const claudeHome = getClaudeConfigHomeDir()

  const files: RuleFile[] = []

  // Project root CLAUDE.md
  const rootClaudeMd = path.join(cwd, 'CLAUDE.md')
  files.push({
    path: rootClaudeMd,
    exists: await fileExists(rootClaudeMd),
    type: 'project',
    label: 'CLAUDE.md',
  })

  // Project .claude/CLAUDE.md
  const dotClaudeMd = path.join(cwd, '.claude', 'CLAUDE.md')
  files.push({
    path: dotClaudeMd,
    exists: await fileExists(dotClaudeMd),
    type: 'project',
    label: '.claude/CLAUDE.md',
  })

  // Project .claude/rules/ directory
  const rulesDir = path.join(cwd, '.claude', 'rules')
  const ruleFiles = await listMdFiles(rulesDir)
  for (const ruleFile of ruleFiles) {
    files.push({
      path: ruleFile,
      exists: true,
      type: 'project',
      label: '.claude/rules/' + path.basename(ruleFile),
    })
  }

  // CLAUDE.local.md
  const localMd = path.join(cwd, 'CLAUDE.local.md')
  files.push({
    path: localMd,
    exists: await fileExists(localMd),
    type: 'local',
    label: 'CLAUDE.local.md',
  })

  // User ~/.claude/CLAUDE.md
  const userClaudeMd = path.join(claudeHome, 'CLAUDE.md')
  files.push({
    path: userClaudeMd,
    exists: await fileExists(userClaudeMd),
    type: 'user',
    label: '~/.claude/CLAUDE.md',
  })

  // User ~/.claude/rules/ directory
  const userRulesDir = path.join(claudeHome, 'rules')
  const userRuleFiles = await listMdFiles(userRulesDir)
  for (const ruleFile of userRuleFiles) {
    files.push({
      path: ruleFile,
      exists: true,
      type: 'user',
      label: '~/.claude/rules/' + path.basename(ruleFile),
    })
  }

  return Response.json({ files, cwd })
}

async function createProjectRulesFile(req: Request, url: URL): Promise<Response> {
  let body: { scope?: string; cwd?: string; filename?: string }
  try {
    body = await req.json() as { scope?: string; cwd?: string; filename?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const scope = body.scope
  const cwd = body.cwd || url.searchParams.get('cwd') || getCwd()
  const filename = body.filename || 'CLAUDE.md'

  let filePath: string
  if (scope === 'project-root') {
    filePath = path.join(cwd, filename)
  } else if (scope === 'project') {
    filePath = path.join(cwd, '.claude', filename)
  } else if (scope === 'project-rules') {
    filePath = path.join(cwd, '.claude', 'rules', filename)
  } else if (scope === 'user') {
    filePath = path.join(getClaudeConfigHomeDir(), filename)
  } else if (scope === 'user-rules') {
    filePath = path.join(getClaudeConfigHomeDir(), 'rules', filename)
  } else if (scope === 'local') {
    filePath = path.join(cwd, 'CLAUDE.local.md')
  } else {
    return Response.json({ error: 'Invalid scope' }, { status: 400 })
  }

  // Don't overwrite existing files
  if (await fileExists(filePath)) {
    return Response.json({ ok: true, path: filePath, created: false })
  }

  // Create directory if needed
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  // Create file with template content
  const template = getTemplate(scope, filename)
  await fs.writeFile(filePath, template, 'utf-8')

  return Response.json({ ok: true, path: filePath, created: true })
}

function getTemplate(scope: string, filename: string): string {
  if (scope === 'local') {
    return '# Local Rules\n\n<!-- Local rules (gitignored). Add machine-specific instructions here. -->\n'
  }
  if (scope?.includes('rules')) {
    const name = filename.replace(/\.md$/, '')
    return `# ${name}\n\n<!-- Add rule content here. -->\n`
  }
  if (scope === 'user' || scope === 'user-rules') {
    return '# User Rules\n\n<!-- Global rules applied to all projects. -->\n'
  }
  return '# Project Rules\n\n<!-- Project-specific instructions loaded into every conversation. -->\n'
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function listMdFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => path.join(dirPath, e.name))
  } catch {
    return []
  }
}
