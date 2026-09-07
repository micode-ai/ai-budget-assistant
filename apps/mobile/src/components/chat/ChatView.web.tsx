import { useIsDesktopWeb } from '../webLayout.constants';
import { useChatScreenData } from '@/features/chat/useChatScreenData';
import { ChatMobile } from './ChatMobile';

/**
 * The one file that decides, on width alone: desktop above 1024, mobile
 * below — the same rule `ExpensesView.web.tsx` follows. `ChatDesktop` does
 * not exist yet (it lands in a later task on this branch), so both branches
 * render `ChatMobile` for now; swapping the true branch to `ChatDesktop` is
 * the only edit that task needs to make here.
 *
 * The hook is called HERE, once, and its whole return value passed down as
 * one `chat` prop — not separately inside `ChatMobile`/`ChatDesktop`. See
 * `useChatScreenData`'s own doc comment: it fires a mount-scoped telemetry
 * event and owns a per-visit dedup ref, and a browser resize across the
 * desktop breakpoint swaps the child component, so a hook mounted in the
 * child would reset the half-typed draft and double-count that event.
 */
export function ChatView() {
  const chat = useChatScreenData();
  return useIsDesktopWeb() ? <ChatMobile chat={chat} /> : <ChatMobile chat={chat} />;
}
