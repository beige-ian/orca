import { quoteStartupArg, type AgentStartupShell } from './tui-agent-startup-shell'

const ORCA_CODEX_BROWSER_PLUGIN_OVERRIDE = 'plugins."browser@openai-bundled".enabled=false'

export function applyCodexBrowserPluginLaunchGuard(
  command: string,
  shell: AgentStartupShell
): string {
  const finalOverride = `-c ${quoteStartupArg(ORCA_CODEX_BROWSER_PLUGIN_OVERRIDE, shell)}`
  if (command.trimEnd().endsWith(finalOverride)) {
    return command
  }
  // Why: Orca's browser belongs to the current workspace and is controlled by
  // Orca CLI; the bundled Codex Browser plugin discovers a different backend.
  // Keep this override last so custom commands and user arguments cannot turn
  // the conflicting plugin back on after Orca has selected its browser route.
  return `${command} ${finalOverride}`
}
