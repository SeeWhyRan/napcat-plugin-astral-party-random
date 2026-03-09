import { generateOpeningSummaryFromUserJsonText } from '../astral-party/opening-service';

/**
 * 验证用户提供的预设 JSON 是否可用于随机开局。
 * - 这里复用现有 opening-service 的 parse+core 逻辑
 * - 成功则返回 true；失败抛错给上层展示
 */
export function validateRandomOpeningPresetJsonText(jsonText: string): true {
    // 能生成 summary 就认为可用
    generateOpeningSummaryFromUserJsonText(jsonText);
    return true;
}
