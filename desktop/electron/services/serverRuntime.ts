import path from 'node:path'
import {
  createAdapterPlan,
  createServerPlan,
  formatStartupError,
  killSidecar,
  pushStartupLog,
  reserveLocalPort,
  SERVER_BIND_HOST,
  SERVER_CONTROL_HOST,
  spawnSidecar,
  waitForServer,
  type SidecarChild,
} from './sidecarManager'

type ServerRuntimeOptions = {
  desktopRoot: string
  appRoot?: string
  h5DistDir?: string
}

export class ElectronServerRuntime {
  private readonly desktopRoot: string
  private readonly appRoot: string
  private readonly h5DistDir: string
  private server: { url: string, child: SidecarChild } | null = null
  private adapters: SidecarChild[] = []
  private startupError: string | null = null
  private startPromise: Promise<string> | null = null

  constructor(options: ServerRuntimeOptions) {
    this.desktopRoot = options.desktopRoot
    this.appRoot = options.appRoot ?? options.desktopRoot
    this.h5DistDir = options.h5DistDir ?? path.join(options.desktopRoot, 'dist')
  }

  async startServer(): Promise<string> {
    if (this.server) return this.server.url
    if (this.startPromise) return this.startPromise

    this.startPromise = this.startServerOnce()
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async getServerUrl(): Promise<string> {
    if (this.server) return this.server.url
    if (this.startupError) throw new Error(this.startupError)
    return await this.startServer()
  }

  async restartAdaptersSidecars(): Promise<void> {
    this.stopAdaptersSidecars()
    const serverUrl = await this.getServerUrl()
    this.startAdaptersSidecars(serverUrl)
  }

  stopAll() {
    this.stopAdaptersSidecars()
    if (this.server) {
      killSidecar(this.server.child)
      this.server = null
    }
  }

  private async startServerOnce(): Promise<string> {
    const port = await reserveLocalPort(SERVER_BIND_HOST)
    const url = `http://${SERVER_CONTROL_HOST}:${port}`
    const logs: string[] = []
    const plan = createServerPlan({
      desktopRoot: this.desktopRoot,
      appRoot: this.appRoot,
      port,
      h5DistDir: this.h5DistDir,
    })

    try {
      const child = spawnSidecar(plan)
      this.captureLogs(child, 'claude-server', logs)
      await waitForServer(SERVER_CONTROL_HOST, port)
      this.server = { url, child }
      this.startupError = null
      this.startAdaptersSidecars(url)
      return url
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.startupError = formatStartupError(message, logs)
      throw new Error(this.startupError)
    }
  }

  private startAdaptersSidecars(serverUrl: string) {
    for (const [label, flag] of [
      ['feishu', '--feishu'],
      ['telegram', '--telegram'],
      ['wechat', '--wechat'],
      ['dingtalk', '--dingtalk'],
    ] as const) {
      try {
        const child = spawnSidecar(createAdapterPlan({
          desktopRoot: this.desktopRoot,
          appRoot: this.appRoot,
          h5DistDir: this.h5DistDir,
          serverUrl,
          flag,
        }))
        this.captureLogs(child, `claude-adapters:${label}`)
        this.adapters.push(child)
      } catch (error) {
        console.error(`[desktop] failed to start ${label} adapter sidecar`, error)
      }
    }
  }

  private stopAdaptersSidecars() {
    for (const child of this.adapters.splice(0)) {
      killSidecar(child)
    }
  }

  private captureLogs(child: SidecarChild, label: string, startupLogs?: string[]) {
    child.stdout.on('data', chunk => {
      const line = String(chunk).trimEnd()
      if (!line) return
      console.log(`[${label}] ${line}`)
      if (startupLogs) pushStartupLog(startupLogs, `[stdout] ${line}`)
    })
    child.stderr.on('data', chunk => {
      const line = String(chunk).trimEnd()
      if (!line) return
      console.error(`[${label}] ${line}`)
      if (startupLogs) pushStartupLog(startupLogs, `[stderr] ${line}`)
    })
    child.on('exit', (code, signal) => {
      const line = `sidecar exited (code=${code}, signal=${signal})`
      console.log(`[${label}] ${line}`)
      if (startupLogs) pushStartupLog(startupLogs, `[exit] ${line}`)
    })
  }
}
