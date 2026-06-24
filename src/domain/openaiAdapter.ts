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

    content.push({
      type: 'image_url',
      image_url: {
        url: attachment.dataUrl
      }
    });
  }

  return {
    role: message.role,
    content
  };
}

export function toOpenAIChatRequest(messages: ChatMessage[], settings: AppSettings): OpenAIChatRequest {
  const activeSettings = getActiveProviderSettings(settings);

  return {
    model: activeSettings.model,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    stream: settings.stream,
    messages: messages.map(toOpenAIMessage)
  };
}
