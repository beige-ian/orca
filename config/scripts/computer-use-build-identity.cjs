const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

const BUILD_IDENTITIES = {
  release: {
    bundleId: 'com.stablyai.orca.computer-use',
    displayName: 'Orca Computer Use'
  },
  development: {
    bundleId: 'com.stablyai.orca.dev.computer-use',
    displayName: 'Orca Computer Use (Dev)'
  },
  'local-package': {
    bundleId: 'com.stablyai.orca.local.computer-use',
    displayName: 'Orca Computer Use (Local)'
  }
}

function resolveComputerUseBuildIdentity({ kind, bundleIdOverride } = {}) {
  const identity = BUILD_IDENTITIES[kind]
  if (!identity) {
    throw new Error(`Unknown computer-use build identity: ${kind ?? 'missing'}`)
  }
  return {
    ...identity,
    bundleId: bundleIdOverride || identity.bundleId
  }
}

function computerUsePlistUpdates(identity) {
  return [
    ['CFBundleIdentifier', identity.bundleId],
    ['CFBundleName', identity.displayName],
    ['CFBundleDisplayName', identity.displayName]
  ]
}

function resolvePackagedComputerUseBuildIdentity({ isRelease, bundleIdOverride } = {}) {
  return resolveComputerUseBuildIdentity({
    kind: isRelease ? 'release' : 'local-package',
    bundleIdOverride
  })
}

function writeComputerUseBuildIdentity(helperAppPath, identity, run = execFileSync) {
  const infoPlistPath = join(helperAppPath, 'Contents', 'Info.plist')
  for (const [key, value] of computerUsePlistUpdates(identity)) {
    run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, infoPlistPath])
  }
}

module.exports = {
  computerUsePlistUpdates,
  resolveComputerUseBuildIdentity,
  resolvePackagedComputerUseBuildIdentity,
  writeComputerUseBuildIdentity
}
