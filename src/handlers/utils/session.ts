import type { OB11Message } from 'napcat-types/napcat-onebot';

/** key: 会话标识（群: g:<groupId>:<userId>；私聊: p:<userId>） */
export function getSessionKey(event: OB11Message): string {
    if (event.message_type === 'group' && event.group_id && event.user_id) {
        return `g:${String(event.group_id)}:${String(event.user_id)}`;
    }
    return `p:${String(event.user_id ?? '')}`;
}
