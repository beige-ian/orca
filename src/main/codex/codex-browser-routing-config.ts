import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  updateTomlLineScanState
} from './config-toml-line-scan'

const ORCA_DISABLED_BROWSER_TABLES = [
  '[mcp_servers.node_repl]',
  '[plugins."browser@openai-bundled"]'
] as const

export function applyOrcaBrowserRoutingConfig(config: string): string {
  return ORCA_DISABLED_BROWSER_TABLES.reduce(forceTomlTableDisabled, config)
}

function forceTomlTableDisabled(config: string, targetHeader: string): string {
  const lines = config.split('\n')
  const sections = findTomlSections(lines).filter((section) => section.header === targetHeader)
  if (sections.length === 0) {
    return appendDisabledTomlTable(config, targetHeader)
  }

  for (const section of sections.toReversed()) {
    const enabledIndex = findEnabledLine(lines, section.start + 1, section.end)
    if (enabledIndex === null) {
      lines.splice(section.start + 1, 0, withMatchingCarriageReturn('enabled = false', lines))
      continue
    }
    lines[enabledIndex] = replaceEnabledValue(lines[enabledIndex] ?? '')
  }
  return lines.join('\n')
}

type TomlSectionRange = { header: string; start: number; end: number }

function findTomlSections(lines: readonly string[]): TomlSectionRange[] {
  const sections: TomlSectionRange[] = []
  let current: Omit<TomlSectionRange, 'end'> | null = null
  let scanState = createTomlLineScanState()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const header = isTomlStructuralLine(scanState) ? getTomlTableHeader(line) : null
    if (header) {
      if (current) {
        sections.push({ ...current, end: index })
      }
      current = { header: header.trim(), start: index }
    }
    scanState = updateTomlLineScanState(scanState, line)
  }
  if (current) {
    sections.push({ ...current, end: lines.length })
  }
  return sections
}

function findEnabledLine(lines: readonly string[], start: number, end: number): number | null {
  let scanState = createTomlLineScanState()
  for (let index = start; index < end; index += 1) {
    const line = lines[index] ?? ''
    if (isTomlStructuralLine(scanState) && /^[ \t]*enabled[ \t]*=/.test(line)) {
      return index
    }
    scanState = updateTomlLineScanState(scanState, line)
  }
  return null
}

function replaceEnabledValue(line: string): string {
  const match = /^([ \t]*)enabled[ \t]*=.*?([ \t]+#.*)?(\r?)$/.exec(line)
  return match ? `${match[1]}enabled = false${match[2] ?? ''}${match[3]}` : line
}

function appendDisabledTomlTable(config: string, targetHeader: string): string {
  const newline = config.includes('\r\n') ? '\r\n' : '\n'
  const separator = config.length === 0 || config.endsWith('\n') ? '' : newline
  return `${config}${separator}${targetHeader}${newline}enabled = false${newline}`
}

function withMatchingCarriageReturn(line: string, lines: readonly string[]): string {
  return lines.some((candidate) => candidate.endsWith('\r')) ? `${line}\r` : line
}
