/**
 * Project Rules (CLAUDE.md) REST API
 *
 * GET  /api/project-rules         — List all known projects and their CLAUDE.md files
 * POST /api/project-rules/create  — Create a CLAUDE.md file if it doesn't exist
 *
 * Scans ~/.claude/projects/ for all known project directories (same as memory),
 * then checks each project for CLAUDE.md files at all valid locations:
 *  - Project root: CLAUDE.md, .claude/CLAUDE.md, .claude/rules/*.md, CLAUDE.local.md
 *  - User level: ~/.claude/CLAUDE.md, ~/.claude/rules/*.md
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getCwd } from '../../utils/cwd.js'
import { findCanonicalGitRoot } from '../../utils/git.js'

type RuleFile = {
  path: string
  exists: boolean
  type: 'project' | 'user' | 'local'
  label: string
}

type ProjectRulesEntry = {
  id: string
  label: string
  projectPath: string | null
  isCurrent: boolean
  files: RuleFile[]
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

function getProjectsDir(): string {
  return path.join(getClaudeConfigHomeDir(), 'projects')
}

function sanitizePath(p: string): string {
  return p.replace(/[<>:"/\\|?*]/g, '-').replace(/^\.+/, '_')
}

async function getProjectRules(url: URL): Promise<Response> {
  const cwd = url.searchParams.get('cwd') || getCwd()
  const claudeHome = getClaudeConfigHomeDir()
  const projectsDir = getProjectsDir()

  // Resolve current project ID
  const currentProjectPath = findCanonicalGitRoot(cwd) ?? cwd
  const currentProjectId = sanitizePath(currentProjectPath)

  // Scan all known project directories
  const projectMap = new Map<string, { id: string; isCurrent: boolean }>()
  projectMap.set(currentProjectId, { id: currentProjectId, isCurrent: true })

  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!projectMap.has(entry.name)) {
        projectMap.set(entry.name, { id: entry.name, isCurrent: false })
      }
    }
  } catch {
    // projects dir may not exist
  }

  // For each project, try to resolve its real path and scan rules
  const projects: ProjectRulesEntry[] = []

  for (const [, { id, isCurrent }] of projectMap) {
    const projectPath = isCurrent ? currentProjectPath : await inferProjectPath(id)
    const files: RuleFile[] = []

    if (projectPath) {
      // Root CLAUDE.md
      const rootMd = path.join(projectPath, 'CLAUDE.md')
      files.push({ path: rootMd, exists: await fileExists(rootMd), type: 'project', label: 'CLAUDE.md' })

      // .claude/CLAUDE.md
      const dotClaudeMd = path.join(projectPath, '.claude', 'CLAUDE.md')
      files.push({ path: dotClaudeMd, exists: await fileExists(dotClaudeMd), type: 'project', label: '.claude/CLAUDE.md' })

      // .claude/rules/*.md
      const rulesDir = path.join(projectPath, '.claude', 'rules')
      for (const rulePath of await listMdFiles(rulesDir)) {
        files.push({ path: rulePath, exists: true, type: 'project', label: '.claude/rules/' + path.basename(rulePath) })
      }

      // CLAUDE.local.md
      const localMd = path.join(projectPath, 'CLAUDE.local.md')
      files.push({ path: localMd, exists: await fileExists(localMd), type: 'local', label: 'CLAUDE.local.md' })
    }

    projects.push({
      id,
      label: projectPath ?? unsanitize(id),
      projectPath,
      isCurrent,
      files,
    })
  }

  // User-level rules (shared across all projects)
  const userFiles: RuleFile[] = []
  const userMd = path.join(claudeHome, 'CLAUDE.md')
  userFiles.push({ path: userMd, exists: await fileExists(userMd), type: 'user', label: '~/.claude/CLAUDE.md' })
  const userRulesDir = path.join(claudeHome, 'rules')
  for (const rulePath of await listMdFiles(userRulesDir)) {
    userFiles.push({ path: rulePath, exists: true, type: 'user', label: '~/.claude/rules/' + path.basename(rulePath) })
  }

  // Sort: current project first, then alphabetical
  projects.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    return a.label.localeCompare(b.label)
  })

  // Filter out projects with no existing files and no resolvable path (unless current)
  const filtered = projects.filter(p => p.isCurrent || p.projectPath !== null)

  return Response.json({ projects: filtered, userFiles, cwd })
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

  if (await fileExists(filePath)) {
    return Response.json({ ok: true, path: filePath, created: false })
  }

  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const template = getTemplate(scope, filename)
  await fs.writeFile(filePath, template, 'utf-8')

  return Response.json({ ok: true, path: filePath, created: true })
}

// --- Helpers ---

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

function unsanitize(id: string): string {
  // Best-effort reverse of sanitizePath for display
  return id.replace(/-/g, path.sep)
}

async function inferProjectPath(projectId: string): Promise<string | null> {
  // Try to read a session file from the project dir to find the real path
  const projectDir = path.join(getProjectsDir(), projectId)
  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      // Read first few bytes to find workDir
      const filePath = path.join(projectDir, entry.name)
      const content = await fs.readFile(filePath, { encoding: 'utf-8' })
      const firstLine = content.split('\n')[0]
      try {
        const obj = JSON.parse(firstLine)
        if (obj.cwd && typeof obj.cwd === 'string') {
          // Verify the directory still exists
          try {
            await fs.access(obj.cwd)
            return obj.cwd
          } catch {
            // Directory no longer exists
          }
        }
      } catch {
        // Not valid JSON
      }
      break // Only check first session file
    }
  } catch {
    // Directory not readable
  }

  // Fallback: check if unsanitized path exists as a directory
  const guessedPath = unsanitize(projectId)
  try {
    const stat = await fs.stat(guessedPath)
    if (stat.isDirectory()) return guessedPath
  } catch {
    // nope
  }

  return null
}
