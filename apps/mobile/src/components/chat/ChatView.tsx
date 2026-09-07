import { useChatScreenData } from '@/features/chat/useChatScreenData';
import { ChatMobile } from './ChatMobile';

/**
 * Native. There is no desktop on a phone, so this is the mobile view and
 * nothing else. The web counterpart is `ChatView.web.tsx`; Metro resolves
 * the platform file at bundle time, so no desktop code reaches the native
 * app.
 *
 * The hook is called HERE, once, and its whole return value passed down as
 * one `chat` prop — see `useChatScreenData`'s own doc comment for why it must
 * not be called again inside `ChatMobile`.
 */
export function ChatView() {
  const chat = useChatScreenData();
  return <ChatMobile chat={chat} />;
}
