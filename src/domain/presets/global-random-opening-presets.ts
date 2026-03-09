import { pluginState } from '../../core/state';
import type { RandomOpeningPreset } from '../../types';

export function getGlobalPresets(): RandomOpeningPreset[] {
    return pluginState.config.globalPresets ?? [];
}
