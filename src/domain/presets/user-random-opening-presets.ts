import { pluginState } from '../../core/state';
import type { RandomOpeningPreset } from '../../types';

export type UserRandomOpeningPresetsFile = {
    version: 1;
    users: Record<string, { presets: RandomOpeningPreset[] }>;
};

const DEFAULT_FILE: UserRandomOpeningPresetsFile = {
    version: 1,
    users: {},
};

const DATA_FILE = 'random-opening-presets.users.json';

export function loadUserPresetsFile(): UserRandomOpeningPresetsFile {
    return pluginState.loadDataFile<UserRandomOpeningPresetsFile>(DATA_FILE, DEFAULT_FILE);
}

export function saveUserPresetsFile(data: UserRandomOpeningPresetsFile): void {
    pluginState.saveDataFile(DATA_FILE, data);
}

export function getUserPresets(userId: string): RandomOpeningPreset[] {
    const data = loadUserPresetsFile();
    return data.users[userId]?.presets ?? [];
}

export function setUserPresets(userId: string, presets: RandomOpeningPreset[]): void {
    const data = loadUserPresetsFile();
    data.users[userId] = { presets };
    saveUserPresetsFile(data);
}

export function deleteUserPresetByIndex(userId: string, index: number): { ok: boolean; message?: string } {
    if (!Number.isInteger(index) || index < 1) {
        return { ok: false, message: '序号无效（从 1 开始）' };
    }

    const presets = getUserPresets(userId);
    if (index > presets.length) {
        return { ok: false, message: `序号超出范围（当前共 ${presets.length} 条）` };
    }

    const newPresets = presets.slice();
    newPresets.splice(index - 1, 1);
    setUserPresets(userId, newPresets);
    return { ok: true };
}

export function upsertUserPreset(userId: string, preset: RandomOpeningPreset): void {
    const presets = getUserPresets(userId);
    const idx = presets.findIndex((p) => p.id === preset.id);
    const now = Date.now();

    if (idx >= 0) {
        const existing = presets[idx];
        presets[idx] = {
            ...existing,
            ...preset,
            updatedAt: now,
        };
    } else {
        presets.push({
            ...preset,
            createdAt: preset.createdAt ?? now,
            updatedAt: preset.updatedAt ?? now,
        });
    }

    setUserPresets(userId, presets);
}
