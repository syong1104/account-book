export const CATEGORIES = ["식비", "교통", "쇼핑", "문화", "기타"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<Category, string> = {
  식비: "#0071e3",
  교통: "#34c759",
  쇼핑: "#ff9500",
  문화: "#af52de",
  기타: "#8e8e93",
};

export function normalizeCategory(value: unknown): Category {
  if (typeof value === "string" && CATEGORIES.includes(value as Category)) {
    return value as Category;
  }
  return "기타";
}
