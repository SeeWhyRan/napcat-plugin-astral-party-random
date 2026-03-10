import type { AstralPartyData } from "./types";
import { ASTRAL_PARTY_DATA } from "./data";

export type CharacterIconUrlOptions = {
  /** 数据源（默认使用包内 ASTRAL_PARTY_DATA） */
  data?: AstralPartyData;
};

/**
 * 根据角色名获取角色头像/图片 URL。
 *
 * 说明：
 * - 角色名必须与数据表中的 `chars[].name` 一致（例如："商业之主:帕露南"）
 * - 找不到时返回 null
 */
export function getCharacterImageUrlByName(name: string, options: CharacterIconUrlOptions = {}): string | null {
  const data = options.data || ASTRAL_PARTY_DATA;
  const found = data.chars.find((c) => c.name === name);
  return found?.icon ?? null;
}

/**
 * 根据角色索引（与数据表 chars 数组顺序一致）获取角色头像/图片 URL。
 * 越界时返回 null。
 */
export function getCharacterImageUrlByIndex(index: number, options: CharacterIconUrlOptions = {}): string | null {
  const data = options.data || ASTRAL_PARTY_DATA;
  if (!Number.isFinite(index) || index < 0 || index >= data.chars.length) return null;
  return data.chars[index]!.icon ?? null;
}
