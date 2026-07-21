import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  computerUsePlistUpdates,
  resolveComputerUseBuildIdentity,
  resolvePackagedComputerUseBuildIdentity,
  writeComputerUseBuildIdentity
} from './computer-use-build-identity.cjs'

describe('computer-use build identity', () => {
  it('keeps the production identity stable across releases', () => {
    expect(resolveComputerUseBuildIdentity({ kind: 'release' })).toEqual({
      bundleId: 'com.stablyai.orca.computer-use',
      displayName: 'Orca Computer Use'
    })
  })

  it('isolates source development and local package permissions from production', () => {
    const development = resolveComputerUseBuildIdentity({ kind: 'development' })
    const localPackage = resolveComputerUseBuildIdentity({ kind: 'local-package' })
    const release = resolveComputerUseBuildIdentity({ kind: 'release' })

    expect(new Set([development.bundleId, localPackage.bundleId, release.bundleId]).size).toBe(3)
    expect(development.displayName).toBe('Orca Computer Use (Dev)')
    expect(localPackage.displayName).toBe('Orca Computer Use (Local)')
  })

  it('preserves an explicit bundle id override without hiding the build label', () => {
    expect(
      resolveComputerUseBuildIdentity({
        kind: 'development',
        bundleIdOverride: 'com.example.computer-use'
      })
    ).toEqual({
      bundleId: 'com.example.computer-use',
      displayName: 'Orca Computer Use (Dev)'
    })
  })

  it('preserves explicit bundle ids while selecting local and release package labels', () => {
    expect(
      resolvePackagedComputerUseBuildIdentity({
        isRelease: false,
        bundleIdOverride: 'com.example.local.computer-use'
      })
    ).toEqual({
      bundleId: 'com.example.local.computer-use',
      displayName: 'Orca Computer Use (Local)'
    })
    expect(
      resolvePackagedComputerUseBuildIdentity({
        isRelease: true,
        bundleIdOverride: 'com.example.release.computer-use'
      })
    ).toEqual({
      bundleId: 'com.example.release.computer-use',
      displayName: 'Orca Computer Use'
    })
  })

  it('rewrites every plist field macOS uses to identify the packaged helper', () => {
    expect(
      computerUsePlistUpdates(resolveComputerUseBuildIdentity({ kind: 'local-package' }))
    ).toEqual([
      ['CFBundleIdentifier', 'com.stablyai.orca.local.computer-use'],
      ['CFBundleName', 'Orca Computer Use (Local)'],
      ['CFBundleDisplayName', 'Orca Computer Use (Local)']
    ])
  })

  it('writes the isolated identity before the packaged helper is signed', () => {
    const run = vi.fn()
    const helperAppPath = '/tmp/Orca Computer Use.app'

    writeComputerUseBuildIdentity(
      helperAppPath,
      resolveComputerUseBuildIdentity({ kind: 'local-package' }),
      run
    )

    expect(run).toHaveBeenNthCalledWith(1, '/usr/libexec/PlistBuddy', [
      '-c',
      'Set :CFBundleIdentifier com.stablyai.orca.local.computer-use',
      join(helperAppPath, 'Contents', 'Info.plist')
    ])
    expect(run).toHaveBeenNthCalledWith(2, '/usr/libexec/PlistBuddy', [
      '-c',
      'Set :CFBundleName Orca Computer Use (Local)',
      join(helperAppPath, 'Contents', 'Info.plist')
    ])
    expect(run).toHaveBeenNthCalledWith(3, '/usr/libexec/PlistBuddy', [
      '-c',
      'Set :CFBundleDisplayName Orca Computer Use (Local)',
      join(helperAppPath, 'Contents', 'Info.plist')
    ])
  })
})
