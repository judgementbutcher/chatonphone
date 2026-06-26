import type { AppSettings, ChatMessage, OpenAIChatRequest, OpenAIContentPart, OpenAIMessage } from './types';
import { getActiveProviderSettings } from '../settings/settingsStore';

function attachmentText(message: ChatMessage) {
  const textAttachments = message.attachments.filter((attachment) => attachment.kind === 'text');

  if (textAttachments.length === 0) {
    return message.text;
  }

  const fileSections = textAttachments.map((attachment) => `[File: ${attachment.name}]\n${attachment.text}`);
  const baseText = message.text.trim().length > 0 ? message.text : '请参考附件内容。';

  return [baseText, ...fileSections].join('\n\n');
}

function toOpenAIMessage(message: ChatMessage): OpenAIMessage {
  if (message.attachments.length === 0 || message.role !== 'user') {
    return {
      role: message.role,
      content: message.text
    };
  }

  const content: OpenAIContentPart[] = [];
  const text = attachmentText(message);

  if (text.trim().length > 0) {
    content.push({
      type: 'text',
      text
    });
  }

  for (const attachment of message.attachments) {
    if (attachment.kind === 'text') {
      continue;
    }

    if (!attachment.dataUrl) {
      continue;
    }

    content.push({
      type: 'image_url',
      image_url: {
        url: attachment.dataUrl,
        detail: 'auto'
      }
    });
  }

  return {
    role: message.role,
    content
  };
}

export function toOpenAIChatRequest(messages: ChatMessage[], settings: AppSettings, systemPrompt?: string): OpenAIChatRequest {
  const activeSettings = getActiveProviderSettings(settings);
  const openaiMessages = messages.map(toOpenAIMessage);

  // Prepend the bound persona as a system message. Guarded on a non-empty
  // trimmed prompt so conversations without a persona produce a byte-identical
  // request to before this feature existed.
  const trimmedSystemPrompt = systemPrompt?.trim();
  const messagesWithSystem: OpenAIMessage[] = trimmedSystemPrompt
    ? [{ role: 'system', content: trimmedSystemPrompt }, ...openaiMessages]
    : openaiMessages;

  return {
    model: activeSettings.chatModel || activeSettings.model,
    temperature: activeSettings.temperature,
    max_tokens: activeSettings.maxTokens,
    stream: activeSettings.stream,
    messages: messagesWithSystem
  };
}
