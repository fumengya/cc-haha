import { describe, expect, test } from 'bun:test'
import agentCommand, { parseAgentCommandArgs } from './agent.js'

describe('/agent command', () => {
  test('parses an agent type and prompt', () => {
    expect(parseAgentCommandArgs('debugger fix the failing tests')).toEqual({
      agentType: 'debugger',
      prompt: 'fix the failing tests',
    })
  })

  test('requires both an agent type and prompt', () => {
    expect(parseAgentCommandArgs('')).toBeNull()
    expect(parseAgentCommandArgs('debugger')).toBeNull()
  })

  test('passes only the prompt body to forked execution', async () => {
    await expect(agentCommand.getPromptForCommand('debugger inspect auth', {} as never)).resolves.toEqual([
      { type: 'text', text: 'inspect auth' },
    ])
  })
})
