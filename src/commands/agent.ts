import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'

export type ParsedAgentCommandArgs = {
  agentType: string
  prompt: string
}

export function parseAgentCommandArgs(args: string): ParsedAgentCommandArgs | null {
  const trimmed = args.trim()
  if (!trimmed) return null

  const match = /^(\S+)(?:\s+([\s\S]+))?$/.exec(trimmed)
  const agentType = match?.[1]?.trim()
  const prompt = match?.[2]?.trim()
  if (!agentType || !prompt) return null

  return { agentType, prompt }
}

const agentCommand: Command = {
  type: 'prompt',
  name: 'agent',
  description: 'Run a prompt with a selected Agent',
  argumentHint: '<agent> <prompt>',
  progressMessage: 'running agent',
  contentLength: 0,
  source: 'builtin',
  context: 'fork',
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    const parsed = parseAgentCommandArgs(args)
    return [
      {
        type: 'text',
        text: parsed?.prompt ?? args.trim(),
      },
    ]
  },
}

export default agentCommand
