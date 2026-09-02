import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey } from "@/lib/env";
import { Category, CATEGORIES, normalizeCategory } from "@/lib/categories";

export async function categorizeDescription(description: string): Promise<Category> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return "기타";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const result = await model.generateContent(
      `지출 내용 "${description}"을 아래 카테고리 중 하나로 분류하세요: ${CATEGORIES.join(", ")}
반드시 카테고리 이름만 한 단어로 응답하세요.`,
    );

    return normalizeCategory(result.response.text().trim());
  } catch {
    return "기타";
  }
}
