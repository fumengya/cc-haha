#!/usr/bin/env bun

import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { loadQuarantineManifest, quarantinedPathSet } from '../quality-gate/quarantine'

const root = process.cwd()
const roots = ['src/server', 'src/tools', 'src/utils']
const excludedFiles = quarantinedPathSet(loadQuarantineManifest())

function normalize(path: string) {
  return relative(root, path).split(sep).join('/')
}

function walk(path: string, files: string[]) {
  const stat = statSync(path)

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry), files)
    }
    return
  }

  if (!stat.isFile()) {
    return
  }

  const normalized = normalize(path)
  if (normalized.endsWith('.test.ts') && !excludedFiles.has(normalized)) {
    files.push(normalized)
  }
}

const testFiles: string[] = []
for (const testRoot of roots) {
  walk(join(root, testRoot), testFiles)
}

testFiles.sort()

if (testFiles.length === 0) {
  console.log('No server-side test files found.')
  process.exit(0)
}

async function runTests(label: string, files: string[]): Promise<number> {
  if (files.length === 0) return 0

  console.log(`\n[server-tests] ${label}`)
  const proc = Bun.spawn(['bun', 'test', ...files], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  return await proc.exited
}

const isolatedFiles = new Set([
  'src/server/__tests__/conversations.test.ts',
  'src/server/__tests__/project-rules.test.ts',
  'src/server/__tests__/projects.test.ts',
  'src/server/__tests__/projects-export-import.test.ts',
  'src/server/__tests__/providers.test.ts',
  'src/server/__tests__/skills.test.ts',
  'src/server/__tests__/teams.test.ts',
  'src/server/__tests__/trace-capture.test.ts',
  'src/server/__tests__/websocket-handler.test.ts',
  'src/server/api/__tests__/localFile.test.ts',
  'src/server/__tests__/e2e/business-flow.test.ts',
  'src/server/__tests__/e2e/full-flow.test.ts',
  'src/server/__tests__/workspace-service.test.ts',
  'src/tools/AgentTool/loadAgentsDir.cache.test.ts',
  'src/utils/__tests__/stats.test.ts',
  'src/utils/__tests__/worktree.test.ts',
  'src/utils/plugins/installedPluginsManager.test.ts',
  'src/utils/plugins/marketplaceManager.test.ts',
  'src/utils/processUserInput/processSlashCommand.test.ts',
  'src/utils/task/diskOutput.symlink.test.ts',
])
const isolatedTestFiles = testFiles.filter(file => isolatedFiles.has(file))
const batchTestFiles = testFiles.filter(file => !isolatedFiles.has(file))

let failed = false

for (const testFile of isolatedTestFiles) {
  if (await runTests(`isolated ${testFile}`, [testFile]) !== 0) {
    failed = true
  }
}

if (await runTests('remaining server-side tests', batchTestFiles) !== 0) {
  failed = true
}

process.exit(failed ? 1 : 0)
