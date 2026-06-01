import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('release desktop workflow', () => {
  test('build job waits for a PR-quality preflight before packaging', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')

    expect(workflow).toContain('quality-preflight:')
    expect(workflow).toContain('run: bun run verify')
    expect(workflow).toContain('- quality-preflight')
    expect(workflow).toContain('name: Build (${{ matrix.label }})')
  })

  test('desktop build workflows keep Bun compile cache on the runner work drive', () => {
    for (const workflowPath of [
      '.github/workflows/build-desktop-dev.yml',
      '.github/workflows/release-desktop.yml',
    ]) {
      const workflow = readFileSync(workflowPath, 'utf8')
      for (const stepName of ['Build sidecars']) {
        const step = workflow.match(
          new RegExp(`- name: ${stepName}[\\s\\S]*?(?:\\n\\s{6}- name:|\\n\\s*with:|$)`),
        )?.[0]

        expect(step, `${workflowPath} ${stepName}`).toContain(
          'BUN_INSTALL_CACHE_DIR: ${{ runner.temp }}/bun-install-cache',
        )
        expect(step, `${workflowPath} ${stepName}`).toContain(
          'SIDECAR_TARGET_TRIPLE: ${{ matrix.target_triple }}',
        )
      }

      expect(workflow).toContain('Build Electron')
      expect(workflow).toContain('smoke_platform')
      expect(workflow).toContain('bun run test:package-smoke --platform ${{ matrix.smoke_platform }} --package-kind release --artifacts-dir desktop/build-artifacts/electron')
      expect(workflow).not.toContain('tauri-apps/tauri-action@v0')
    }
  })

  test('release workflow requires macOS Gatekeeper launch approval before upload', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')
    const gatekeeperStep = workflow.match(
      /- name: Verify macOS launch policy[\s\S]*?(?:\n\s{6}- name:|$)/,
    )?.[0]

    expect(gatekeeperStep).toContain("if: matrix.smoke_platform == 'macos'")
    expect(gatekeeperStep).toContain('bun run test:package-smoke --platform macos --package-kind release --artifacts-dir desktop/build-artifacts/electron --require-macos-gatekeeper')
    expect(workflow.indexOf('Verify macOS launch policy')).toBeLessThan(workflow.indexOf('Upload artifacts'))
  })

  test('release workflow fails globally before matrix fan-out when signing or notarization secrets are missing', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')
    const signingJob = workflow.match(
      /signing-preflight:[\s\S]*?(?:\n {2}[a-zA-Z0-9_-]+:|$)/,
    )?.[0]
    const buildJob = workflow.match(
      /build:[\s\S]*?(?:\n {2}[a-zA-Z0-9_-]+:|$)/,
    )?.[0]

    expect(signingJob).toContain('Validate release signing and notarization secrets')
    for (const secret of [
      'MACOS_CERTIFICATE',
      'MACOS_CERTIFICATE_PASSWORD',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
      'WINDOWS_CERTIFICATE',
      'WINDOWS_CERTIFICATE_PASSWORD',
    ]) {
      expect(signingJob).toContain(secret)
    }
    expect(signingJob).toContain('Missing required release signing/notarization secrets')
    expect(buildJob).toContain('- quality-preflight')
    expect(buildJob).toContain('- signing-preflight')
    expect(workflow.indexOf('signing-preflight:')).toBeLessThan(workflow.indexOf('build:'))
    expect(workflow.indexOf('signing-preflight:')).toBeLessThan(workflow.indexOf('Upload artifacts'))
  })

  test('release workflow avoids same-name updater metadata uploads from matrix builds', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')
    const namespaceStep = workflow.match(
      /- name: Namespace update metadata assets[\s\S]*?(?:\n\s{6}- name:|$)/,
    )?.[0]

    expect(namespaceStep).toContain('for file in latest*.yml')
    expect(namespaceStep).toContain('"${file%.yml}-${{ matrix.label }}.yml"')
    expect(workflow.indexOf('Namespace update metadata assets')).toBeLessThan(workflow.indexOf('Upload artifacts'))
  })

  test('release workflow republishes standard updater metadata after all matrix builds pass', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')
    const publishJob = workflow.match(
      /publish-update-metadata:[\s\S]*?(?:\n {2}[a-zA-Z0-9_-]+:|$)/,
    )?.[0]

    expect(workflow).toContain('name: desktop-update-metadata-${{ matrix.label }}')
    expect(publishJob).toContain('needs: build')
    expect(publishJob).toContain('actions/download-artifact@v4')
    expect(publishJob).toContain('pattern: desktop-update-metadata-*')
    expect(publishJob).toContain('bun run scripts/release-update-metadata.ts --metadata-dir artifacts/update-metadata --out-dir artifacts/update-metadata-standard')
    expect(publishJob).toContain('files: artifacts/update-metadata-standard/*.yml')
    expect(workflow.indexOf('publish-update-metadata:')).toBeGreaterThan(workflow.indexOf('build:'))
  })

  test('Electron Builder publish config does not rely on git remote autodetection', () => {
    const desktopPackage = JSON.parse(readFileSync('desktop/package.json', 'utf8')) as {
      build: {
        publish?: Array<{ provider?: string, owner?: string, repo?: string }>
        mac?: { publish?: unknown }
        win?: { publish?: unknown }
        linux?: { publish?: unknown }
      }
    }

    expect(desktopPackage.build.publish).toEqual([
      {
        provider: 'github',
        owner: 'NanmiCoder',
        repo: 'cc-haha',
      },
    ])
    expect(desktopPackage.build.mac?.publish).toBeUndefined()
    expect(desktopPackage.build.win?.publish).toBeUndefined()
    expect(desktopPackage.build.linux?.publish).toBeUndefined()
  })
})
