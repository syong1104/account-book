import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/env";
import { todayString } from "@/lib/format";
import { categorizeDescription } from "@/lib/categorize";
import { insertTransaction } from "@/lib/supabase";

type ReceiptData = {
  date: string;
  amount: number;
  description: string;
};

function normalizeDate(date: string): string | null {
  const match = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseReceiptResponse(text: string): ReceiptData | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ReceiptData;
    const date = normalizeDate(parsed.date) ?? todayString();
    const amount = Math.round(Number(parsed.amount));
    const description = parsed.description?.trim();

    if (!description || !Number.isFinite(amount) || amount <= 0) return null;

    return { date, amount, description };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API 키가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as { image: string; mimeType?: string };
    if (!body.image) {
      return NextResponse.json({ error: "이미지가 없습니다." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: body.mimeType || "image/jpeg",
          data: body.image,
        },
      },
      {
        text: `이 영수증 이미지에서 정보를 추출하세요.
오늘 날짜: ${todayString()}

반드시 아래 JSON 형식으로만 응답하세요:
{"date":"YYYY-MM-DD","amount":15000,"description":"가게이름 또는 내용"}

규칙:
- amount는 총 결제 금액 (양수 정수)
- description은 가게 이름 또는 주요 내용
- 날짜가 없으면 오늘 날짜 사용`,
      },
    ]);

    const receipt = parseReceiptResponse(result.response.text());
    if (!receipt) {
      return NextResponse.json({
        error: "영수증에서 정보를 읽지 못했어요. 더 선명한 사진을 올려주세요.",
      });
    }

    const category = await categorizeDescription(receipt.description);
    const { data: saved, error } = await insertTransaction({
      ...receipt,
      type: "expense",
      category,
    });

    if (error || !saved) {
      return NextResponse.json({
        error: `저장 실패: ${error?.message || "데이터베이스 오류"}`,
      });
    }

    return NextResponse.json({
      reply: `${receipt.description} ${receipt.amount.toLocaleString("ko-KR")}원을 [${category}]로 저장했어요!`,
      transaction: saved,
      saved: true,
    });
  } catch (error) {
    console.error("Receipt API error:", error);
    return NextResponse.json(
      { error: "영수증 분석에 실패했어요. 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
