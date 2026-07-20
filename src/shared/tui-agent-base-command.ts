import { applyCodexBrowserPluginLaunchGuard } from './codex-browser-plugin-launch-guard'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './tui-agent-config'
import { planAgentCliArgsSuffix, type AgentStartupShell } from './tui-agent-startup-shell'
import type { TuiAgent } from './types'

export function applyOrcaAgentLaunchGuard(
  agent: TuiAgent,
  command: string,
  shell: AgentStartupShell
): string {
  return agent === 'codex' ? applyCodexBrowserPluginLaunchGuard(command, shell) : command
}

export function resolveTuiAgentBaseCommand(args: {
  agent: TuiAgent
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell: AgentStartupShell
  agentArgs?: string | null
  isRemote?: boolean
}): { ok: true; command: string } | { ok: false; error: string } {
  const override = args.cmdOverrides[args.agent]
  const command =
    override ||
    getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[args.agent], args.platform, {
      isRemote: args.isRemote
    })
  const suffix = planAgentCliArgsSuffix(args.agentArgs, args.shell)
  if (!suffix.ok) {
    return suffix
  }
  const commandWithUserArgs = suffix.suffix ? `${command} ${suffix.suffix}` : command
  return {
    ok: true,
    command: applyOrcaAgentLaunchGuard(args.agent, commandWithUserArgs, args.shell)
  }
}
