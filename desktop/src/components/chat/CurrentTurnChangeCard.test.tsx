import '@testing-library/jest-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'

// ──────────────────────────────────────────────────────────────────────────────
// Hoisted mocks (vi.hoisted runs before module evaluation)
// ──────────────────────────────────────────────────────────────────────────────
const { openPreviewSpy, browserOpenSpy, openTargetSpy, ensureTargetsMock } = vi.hoisted(() => {
  const openPreviewSpy = vi.fn().mockResolvedValue(undefined)
  const browserOpenSpy = vi.fn()
  const openTargetSpy = vi.fn().mockResolvedValue(undefined)
  const ensureTargetsMock = vi.fn().mockResolvedValue(undefined)
  return { openPreviewSpy, browserOpenSpy, openTargetSpy, ensureTargetsMock }
})

// Mock sessionsApi so diff calls don't run
vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    getTurnCheckpointDiff: vi.fn().mockResolvedValue({ state: 'ok', diff: '--- a\n+++ b\n@@ -0,0 +1 @@\n+hello' }),
  },
}))

// Mock openTargetStore
vi.mock('../../stores/openTargetStore', () => ({
  useOpenTargetStore: Object.assign(
    // Selector hook form: useOpenTargetStore((s) => s.xxx)
    (selector: (s: { targets: unknown[]; ensureTargets: () => Promise<void>; openTarget: () => Promise<void> }) => unknown) =>
      selector({
        targets: [{ id: 'code', kind: 'ide', label: 'VS Code', icon: '', platform: 'darwin' }],
        ensureTargets: ensureTargetsMock,
        openTarget: openTargetSpy,
      }),
    {
      // Static .getState() access
      getState: vi.fn(() => ({
        targets: [{ id: 'code', kind: 'ide', label: 'VS Code', icon: '', platform: 'darwin' }],
        ensureTargets: ensureTargetsMock,
        openTarget: openTargetSpy,
      })),
    },
  ),
}))

// Mock browserPanelStore
vi.mock('../../stores/browserPanelStore', () => ({
  useBrowserPanelStore: Object.assign(
    (selector: (s: { open: () => void }) => unknown) =>
      selector({ open: browserOpenSpy }),
    {
      getState: vi.fn(() => ({ open: browserOpenSpy })),
    },
  ),
}))

// Mock workspacePanelStore
vi.mock('../../stores/workspacePanelStore', () => ({
  useWorkspacePanelStore: Object.assign(
    (selector: (s: { openPreview: () => Promise<void> }) => unknown) =>
      selector({ openPreview: openPreviewSpy }),
    {
      getState: vi.fn(() => ({ openPreview: openPreviewSpy })),
    },
  ),
}))

// Mock @tauri-apps/plugin-shell
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}))

// Mock desktopRuntime.getServerBaseUrl
vi.mock('../../lib/desktopRuntime', () => ({
  getServerBaseUrl: vi.fn(() => 'http://127.0.0.1:4321'),
}))

// Mock useTranslation: returns identity-ish t function
vi.mock('../../i18n', () => ({
  useTranslation: () => (key: string, params?: Record<string, string | number>) => {
    if (params) {
      return Object.entries(params).reduce<string>(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        key,
      )
    }
    return key
  },
}))

// ──────────────────────────────────────────────────────────────────────────────
// Import after mocks
// ──────────────────────────────────────────────────────────────────────────────
import { CurrentTurnChangeCard } from './CurrentTurnChangeCard'
import type { SessionTurnCheckpoint } from '../../api/sessions'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function makeCheckpoint(filesChanged: string[]): SessionTurnCheckpoint {
  return {
    code: {
      available: true,
      filesChanged,
      insertions: 10,
      deletions: 0,
    },
    target: {
      targetUserMessageId: 'msg-1',
      userMessageIndex: 0,
      userMessageCount: 1,
    },
    conversation: {
      messagesRemoved: 0,
    },
  }
}

function renderCard(filesChanged: string[]) {
  const checkpoint = makeCheckpoint(filesChanged)
  return render(
    <CurrentTurnChangeCard
      sessionId="s1"
      targetUserMessageId="msg-1"
      checkpoint={checkpoint}
      workDir="/w/proj"
      error={null}
      isUndoing={false}
      isLatest={true}
      onUndo={vi.fn()}
    />,
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe('CurrentTurnChangeCard – rich file row (icon / name / type)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureTargetsMock.mockResolvedValue(undefined)
    openPreviewSpy.mockResolvedValue(undefined)
  })

  it('renders the filename (not just full path) for each file', () => {
    renderCard(['/w/proj/README.md', '/w/proj/src/index.ts'])
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('index.ts')).toBeInTheDocument()
  })

  it('renders the extension badge for a markdown file', () => {
    renderCard(['/w/proj/README.md'])
    // The type subtitle contains the ext in uppercase: "· MD"
    expect(screen.getByText(/MD/)).toBeInTheDocument()
  })

  it('renders the extension badge for a TypeScript file', () => {
    renderCard(['/w/proj/src/main.ts'])
    expect(screen.getByText(/TS/)).toBeInTheDocument()
  })

  it('renders the extension badge for an HTML file', () => {
    renderCard(['/w/proj/index.html'])
    expect(screen.getByText(/HTML/)).toBeInTheDocument()
  })
})

describe('CurrentTurnChangeCard – open-with buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureTargetsMock.mockResolvedValue(undefined)
    openPreviewSpy.mockResolvedValue(undefined)
  })

  it('renders an "open-with" button for each previewable file', () => {
    renderCard(['/w/proj/README.md', '/w/proj/index.html'])
    // aria-label is the i18n key itself (identity mock)
    const buttons = screen.getAllByRole('button', { name: 'openWith.title' })
    expect(buttons).toHaveLength(2)
  })

  it('does NOT render an "open-with" button for a source file (diff toggle stays)', () => {
    renderCard(['/w/proj/src/main.ts'])
    expect(screen.queryAllByRole('button', { name: 'openWith.title' })).toHaveLength(0)
    // source files keep their inline diff toggle — only the open-with pill is dropped
    expect(screen.getByRole('button', { name: /turnChangesShowDiffAria/ })).toBeInTheDocument()
  })

  it('mixed turn: only previewable rows (md/html) get the open-with button, not .ts', () => {
    renderCard(['/w/proj/README.md', '/w/proj/src/main.ts', '/w/proj/index.html'])
    expect(screen.getAllByRole('button', { name: 'openWith.title' })).toHaveLength(2)
  })

  it('clicking README.md open-with opens menu with workspace preview item', async () => {
    renderCard(['/w/proj/README.md'])
    const [openWithBtn] = screen.getAllByRole('button', { name: 'openWith.title' })

    await act(async () => {
      fireEvent.click(openWithBtn!)
    })

    // The menu should show a workspace preview item (i18n key)
    expect(await screen.findByText('openWith.workspacePreview')).toBeInTheDocument()
  })

  it('clicking workspace preview item in README.md menu calls openPreview', async () => {
    renderCard(['/w/proj/README.md'])
    const [openWithBtn] = screen.getAllByRole('button', { name: 'openWith.title' })

    await act(async () => {
      fireEvent.click(openWithBtn!)
    })

    const previewItem = await screen.findByText('openWith.workspacePreview')
    await act(async () => {
      fireEvent.click(previewItem)
    })

    expect(openPreviewSpy).toHaveBeenCalledWith('s1', 'README.md', 'file')
  })

  it('clicking index.html open-with opens menu with in-app browser item', async () => {
    renderCard(['/w/proj/index.html'])
    const [openWithBtn] = screen.getAllByRole('button', { name: 'openWith.title' })

    await act(async () => {
      fireEvent.click(openWithBtn!)
    })

    expect(await screen.findByText('openWith.inAppBrowser')).toBeInTheDocument()
  })

  it('ensureTargets is called when open-with button is clicked', async () => {
    renderCard(['/w/proj/README.md'])
    const [openWithBtn] = screen.getAllByRole('button', { name: 'openWith.title' })

    await act(async () => {
      fireEvent.click(openWithBtn!)
    })

    expect(ensureTargetsMock).toHaveBeenCalledTimes(1)
  })

  it('diff-toggle button still works (not nested button regression)', async () => {
    renderCard(['/w/proj/README.md'])
    // The diff toggle has aria-label from the i18n key + path
    const diffBtn = screen.getByRole('button', { name: /turnChangesShowDiffAria/ })
    expect(diffBtn).toBeInTheDocument()
    // Clicking should not throw
    await act(async () => {
      fireEvent.click(diffBtn)
    })
  })
})
