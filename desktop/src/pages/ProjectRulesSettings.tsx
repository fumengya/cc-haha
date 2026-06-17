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

type ProjectRulesResponse = {
  files: RuleFile[]
  cwd: string
}

export function ProjectRulesSettings() {
  const t = useTranslation()
  const [rules, setRules] = useState<ProjectRulesResponse | null>(null)
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
      setRules(res)
    } catch {
      setRules(null)
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

  const handleCreate = async (scope: string, filename?: string) => {
    try {
      await api.post(`/api/project-rules/create`, { scope, cwd, filename })
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

  const projectFiles = rules?.files.filter(f => f.type === 'project') ?? []
  const localFiles = rules?.files.filter(f => f.type === 'local') ?? []
  const userFiles = rules?.files.filter(f => f.type === 'user') ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('settings.projectRules.title')}</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{t('settings.projectRules.description')}</p>
        {rules?.cwd && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">{rules.cwd}</p>
        )}
      </div>

      {/* Project Rules Section */}
      <Section title={t('settings.projectRules.projectFile')} description={t('settings.projectRules.projectFileDesc')}>
        {projectFiles.map((file) => (
          <FileRow key={file.path} file={file} onOpen={handleOpen} onCreate={() => {
            if (file.label === 'CLAUDE.md') handleCreate('project-root')
            else if (file.label === '.claude/CLAUDE.md') handleCreate('project')
            else handleCreate('project-rules', file.label.split('/').pop())
          }} t={t} />
        ))}
        {projectFiles.every(f => !f.exists || f.label.startsWith('.claude/rules/')) && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="secondary" onClick={() => handleCreate('project-root')}>
              <span className="material-symbols-outlined text-base mr-1">add</span>
              CLAUDE.md
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleCreate('project-rules', 'new-rule.md')}>
              <span className="material-symbols-outlined text-base mr-1">add</span>
              .claude/rules/
            </Button>
          </div>
        )}
      </Section>

      {/* Local Rules Section */}
      <Section title="Local" description="CLAUDE.local.md (gitignored, machine-specific)">
        {localFiles.map((file) => (
          <FileRow key={file.path} file={file} onOpen={handleOpen} onCreate={() => handleCreate('local')} t={t} />
        ))}
      </Section>

      {/* User Rules Section */}
      <Section title={t('settings.projectRules.userFile')} description={t('settings.projectRules.userFileDesc')}>
        {userFiles.map((file) => (
          <FileRow key={file.path} file={file} onOpen={handleOpen} onCreate={() => {
            if (file.label.includes('rules/')) handleCreate('user-rules', file.label.split('/').pop())
            else handleCreate('user')
          }} t={t} />
        ))}
        {userFiles.every(f => !f.exists || f.label.includes('rules/')) && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="secondary" onClick={() => handleCreate('user')}>
              <span className="material-symbols-outlined text-base mr-1">add</span>
              ~/.claude/CLAUDE.md
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleCreate('user-rules', 'new-rule.md')}>
              <span className="material-symbols-outlined text-base mr-1">add</span>
              ~/.claude/rules/
            </Button>
          </div>
        )}
      </Section>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 space-y-2">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
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
