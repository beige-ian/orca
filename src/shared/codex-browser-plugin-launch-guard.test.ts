import { describe, expect, it } from 'vitest'
import { buildAgentResumeStartupPlan, buildAgentStartupPlan } from './tui-agent-startup'

describe('Orca Codex browser plugin launch guard', () => {
  it.each([
    {
      platform: 'linux' as const,
      shell: 'posix' as const,
      expected: "codex -c 'plugins.\"browser@openai-bundled\".enabled=false' 'inspect the browser'"
    },
    {
      platform: 'win32' as const,
      shell: 'powershell' as const,
      expected: "codex -c 'plugins.\"browser@openai-bundled\".enabled=false' 'inspect the browser'"
    },
    {
      platform: 'win32' as const,
      shell: 'cmd' as const,
      expected: 'codex -c "plugins.^"browser@openai-bundled^".enabled=false" "inspect the browser"'
    }
  ])('disables the bundled Browser plugin on $shell', (testCase) => {
    const plan = buildAgentStartupPlan({
      agent: 'codex',
      prompt: 'inspect the browser',
      cmdOverrides: {},
      platform: testCase.platform,
      shell: testCase.shell
    })

    expect(plan?.launchCommand).toBe(testCase.expected)
    expect(plan?.launchConfig.agentCommand).toBe(
      testCase.expected.replace(
        testCase.shell === 'cmd' ? ' "inspect the browser"' : " 'inspect the browser'",
        ''
      )
    )
  })

  it('wins after an exact conflicting user option', () => {
    const plan = buildAgentStartupPlan({
      agent: 'codex',
      prompt: 'inspect the browser',
      cmdOverrides: { codex: 'codex --profile work' },
      agentArgs: '-c \'plugins."browser@openai-bundled".enabled=true\'',
      platform: 'linux'
    })

    expect(plan?.launchCommand).toBe(
      "codex --profile work '-c' 'plugins.\"browser@openai-bundled\".enabled=true' -c 'plugins.\"browser@openai-bundled\".enabled=false' 'inspect the browser'"
    )
  })

  it('does not accumulate across captured Codex resumes', () => {
    const first = buildAgentResumeStartupPlan({
      agent: 'codex',
      providerSession: { key: 'session_id', id: 's1' },
      agentCommand: 'codex --profile work',
      cmdOverrides: {},
      platform: 'linux'
    })
    const second = buildAgentResumeStartupPlan({
      agent: 'codex',
      providerSession: { key: 'session_id', id: 's1' },
      agentCommand: first?.launchConfig.agentCommand,
      cmdOverrides: {},
      platform: 'linux'
    })

    const capturedCommand = second?.launchConfig.agentCommand ?? ''
    expect(capturedCommand.match(/browser@openai-bundled/g)).toHaveLength(1)
    expect(second?.launchCommand).toBe(
      "codex --profile work -c 'plugins.\"browser@openai-bundled\".enabled=false' 'resume' 's1'"
    )
  })
})
