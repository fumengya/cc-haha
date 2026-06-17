import { useState, useEffect } from 'react'
import { useTranslation, type TranslationKey } from '../i18n'
import { Button } from '../components/shared/Button'
import { useSessionStore } from '../stores/sessionStore'
import { getDesktopHost } from '../lib/desktopHost'
import { api } from '../api/client'

type RuleFile = {
  path: string
  exists: boolean
  type: 'project' | 'user' | 'local'
  label: string
}

type ProjectEntry = {
  id: string
  label: string
  projectPath: string | null
  isCurrent: boolean
  files: RuleFile[]
}

type ProjectRulesResponse = {
  projects: ProjectEntry[]
  userFiles: RuleFile[]
  cwd: string
}

export function ProjectRulesSettings() {
  const t = useTranslation()
  const [data, setData] = useState<ProjectRulesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const cwd = activeSession?.workDir || activeSession?.projectPath || undefined

  const fetchRules = async () => {
    setLoading(true)
    try {
      const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
      const res = await api.get<ProjectRulesResponse>(`/api/project-rules${query}`)
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [cwd])

  const handleOpen = async (filePath: string) => {
    try {
      await getDesktopHost().shell.openPath(filePath)
    } catch {
      // fallback: ignore
    }
  }

  const handleCreate = async (scope: string, projectCwd?: string, filename?: string) => {
    try {
      await api.post(`/api/project-rules/create`, { scope, cwd: projectCwd || cwd, filename })
      await fetchRules()
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-symbols-outlined animate-spin text-[var(--color-text-muted)]">progress_activity</span>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('settings.projectRules.title')}</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{t('settings.projectRules.description')}</p>
      </div>

      {/* User-level rules (global) */}
      <Section title={t('settings.projectRules.userFile')} description={t('settings.projectRules.userFileDesc')}>
        {data.userFiles.map((file) => (
          <FileRow key={file.path} file={file} onOpen={handleOpen} onCreate={() => {
            if (file.label.includes('rules/')) handleCreate('user-rules', undefined, file.label.split('/').pop())
            else handleCreate('user')
          }} t={t} />
        ))}
        {data.userFiles.every(f => !f.exists) && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="secondary" onClick={() => handleCreate('user')}>
              <span className="material-symbols-outlined text-base mr-1">add</span>
              ~/.claude/CLAUDE.md
            </Button>
          </div>
        )}
      </Section>

      {/* Per-project rules */}
      {data.projects.map((project) => (
        <ProjectSection
          key={project.id}
          project={project}
          onOpen={handleOpen}
          onCreate={handleCreate}
          t={t}
        />
      ))}
    </div>
  )
}

function ProjectSection({ project, onOpen, onCreate, t }: {
  project: ProjectEntry
  onOpen: (path: string) => void
  onCreate: (scope: string, cwd?: string, filename?: string) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}) {
  const projectCwd = project.projectPath || undefined
  const hasExistingFiles = project.files.some(f => f.exists)
  const title = project.isCurrent
    ? `${t('settings.projectRules.projectFile')} (current)`
    : t('settings.projectRules.projectFile')

  return (
    <Section
      title={title}
      description={project.label}
    >
      {project.files.filter(f => f.exists).map((file) => (
        <FileRow key={file.path} file={file} onOpen={onOpen} onCreate={() => {}} t={t} />
      ))}
      {project.files.filter(f => !f.exists).map((file) => (
        <FileRow key={file.path} file={file} onOpen={onOpen} onCreate={() => {
          if (file.label === 'CLAUDE.md') onCreate('project-root', projectCwd)
          else if (file.label === '.claude/CLAUDE.md') onCreate('project', projectCwd)
          else if (file.label === 'CLAUDE.local.md') onCreate('local', projectCwd)
        }} t={t} />
      ))}
      {!hasExistingFiles && (
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="secondary" onClick={() => onCreate('project-root', projectCwd)}>
            <span className="material-symbols-outlined text-base mr-1">add</span>
            CLAUDE.md
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onCreate('project-rules', projectCwd, 'new-rule.md')}>
            <span className="material-symbols-outlined text-base mr-1">add</span>
            .claude/rules/
          </Button>
        </div>
      )}
    </Section>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
        <p className="text-xs text-[var(--color-text-muted)] font-mono truncate" title={description}>{description}</p>
      </div>
      {children}
    </div>
  )
}

function FileRow({ file, onOpen, onCreate, t }: {
  file: RuleFile
  onOpen: (path: string) => void
  onCreate: () => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--color-surface-hover)]">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`material-symbols-outlined text-base ${file.exists ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>
          {file.exists ? 'description' : 'note_add'}
        </span>
        <span className="text-sm font-mono truncate" title={file.path}>
          {file.label}
        </span>
      </div>
      <div className="ml-2 flex-shrink-0">
        {file.exists ? (
          <Button size="sm" variant="ghost" onClick={() => onOpen(file.path)}>
            <span className="material-symbols-outlined text-base mr-1">open_in_new</span>
            {t('settings.projectRules.open')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onCreate}>
            <span className="material-symbols-outlined text-base mr-1">add</span>
            {t('settings.projectRules.create')}
          </Button>
        )}
      </div>
    </div>
  )
}
