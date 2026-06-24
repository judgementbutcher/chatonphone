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

    // 确保图片有 dataUrl
    if (!attachment.dataUrl) {
      console.warn('图片缺少 dataUrl:', attachment);
      continue;
    }

    console.log('添加图片到请求:', {
      name: attachment.name,
      dataUrlLength: attachment.dataUrl.length,
      dataUrlPrefix: attachment.dataUrl.substring(0, 50)
    });

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

  // 使用 chatModel（对话界面选择的），如果没有则使用 model
  const modelToUse = settings.chatModel || activeSettings.model;

  const openaiMessages = messages.map(toOpenAIMessage);

  // 调试日志：检查是否有图片消息
  const hasImages = openaiMessages.some((msg) =>
    Array.isArray(msg.content) && msg.content.some((part: any) => part.type === 'image_url')
  );

  if (hasImages) {
    console.log('🖼️ 请求中包含图片:', {
      messagesCount: openaiMessages.length,
      model: modelToUse,
      imageMessages: openaiMessages.filter((msg) =>
        Array.isArray(msg.content) && msg.content.some((part: any) => part.type === 'image_url')
      ).length
    });
  }

  return {
    model: modelToUse,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    stream: settings.stream,
    messages: openaiMessages
  };
}
