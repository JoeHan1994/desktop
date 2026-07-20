/**
 * 轻量 className 合并工具（无第三方依赖）。
 * 过滤 falsy 值并以空格拼接，便于条件式样式组合。
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
	return values.filter(Boolean).join(' ');
}
