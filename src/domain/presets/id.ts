export function generateId(prefix = 'p'): string {
    // 轻量、无依赖的唯一 id：时间戳 + 随机数
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${t}_${r}`;
}
