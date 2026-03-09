import { pluginState } from '../../core/state';

export type RandomOpeningSelectionScope = 'global' | 'personal';

export type UserRandomOpeningSelectionFile = {
    version: 1;
    users: Record<string, {
        scope?: RandomOpeningSelectionScope;
        index?: number; // 1-based
        updatedAt?: number;
    }>;
};

const DEFAULT_FILE: UserRandomOpeningSelectionFile = {
    version: 1,
    users: {},
};

const DATA_FILE = 'random-opening-presets.selection.json';

function loadFile(): UserRandomOpeningSelectionFile {
    return pluginState.loadDataFile<UserRandomOpeningSelectionFile>(DATA_FILE, DEFAULT_FILE);
}

function saveFile(data: UserRandomOpeningSelectionFile): void {
    pluginState.saveDataFile(DATA_FILE, data);
}

export function getUserSelection(userId: string): { scope?: RandomOpeningSelectionScope; index?: number } {
    const data = loadFile();
    const row = data.users[userId] || {};
    return { scope: row.scope, index: row.index };
}

export function setUserSelection(userId: string, scope: RandomOpeningSelectionScope, index: number): void {
    const data = loadFile();
    data.users[userId] = {
        scope,
        index,
        updatedAt: Date.now(),
    };
    saveFile(data);
}
