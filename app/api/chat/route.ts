import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { todayString } from "@/lib/format";
import {
  deleteTransactions,
  Expense,
  findRecordsToDelete,
  insertTransaction,
  TransactionType,
} from "@/lib/supabase";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type TransactionData = {
  type: TransactionType;
  date: string;
  amount: number;
  description: string;
};

type DeleteCriteria = {
  type?: TransactionType;
  date?: string;
  amount?: number;
  description?: string;
};

type ChatAction = "create" | "delete" | null;

type GeminiResult = {
  reply: string;
  action: ChatAction;
  transaction: TransactionData | null;
  deleteIds: string[];
  deleteCriteria: DeleteCriteria | null;
};

function buildSystemPrompt(records: Expense[]) {
  const recent = records
    .slice(0, 30)
    .map(
      (record) =>
        `- [id:${record.id}] [${record.type === "income" ? "수입" : "지출"}] ${record.date} ${record.description} ${record.amount}원`,
    )
    .join("\n");

  return `당신은 "성용이의 가계부 챗봇"입니다. 사용자의 자연어 메시지에서 수입/지출 기록, 삭제, 조회를 처리합니다.

오늘 날짜: ${todayString()}

저장된 내역 (삭제 시 id 사용):
${recent || "없음"}

분석 규칙:
1. 기록 의도 → action: "create", transaction 추출
2. 삭제 의도 → action: "delete", deleteIds 또는 deleteCriteria 설정
3. 삭제 시 최근 내역의 id를 우선 사용합니다.
4. id를 모르면 deleteCriteria에 date, amount, description, type을 설정합니다.
5. 삭제할 내역을 특정할 수 없으면 action을 null로 두고 다시 물어봅니다.
6. 날짜나 금액을 확실히 알 수 없으면 다시 물어봅니다.
7. 인사, 조회, 잡담에는 action을 null로 설정합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

기록:
{"reply":"8월 10일 택시 20,000원을 저장했어요!","action":"create","transaction":{"type":"expense","date":"2026-08-10","amount":20000,"description":"택시"},"deleteIds":[],"deleteCriteria":null}

삭제 (id 알 때):
{"reply":"8월 10일 택시 20,000원 내역을 삭제했어요!","action":"delete","transaction":null,"deleteIds":["여기에-id"],"deleteCriteria":null}

삭제 (조건으로):
{"reply":"택시 내역을 삭제했어요!","action":"delete","transaction":null,"deleteIds":[],"deleteCriteria":{"type":"expense","date":"2026-08-10","amount":20000,"description":"택시"}}

일반 대화:
{"reply":"안녕하세요!","action":null,"transaction":null,"deleteIds":[],"deleteCriteria":null}`;
}

function sanitizeHistory(history: ChatMessage[]) {
  const geminiHistory: Array<{
    role: "user" | "model";
    parts: [{ text: string }];
  }> = [];

  for (const item of history) {
    const role = item.role === "assistant" ? "model" : "user";

    if (geminiHistory.length === 0 && role === "model") {
      continue;
    }

    const last = geminiHistory[geminiHistory.length - 1];
    if (last?.role === role) {
      last.parts[0].text += `\n${item.content}`;
      continue;
    }

    geminiHistory.push({ role, parts: [{ text: item.content }] });
  }

  return geminiHistory;
}

function normalizeDate(date: string): string | null {
  const match = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseGeminiResponse(text: string): GeminiResult {
  const empty: GeminiResult = {
    reply: "응답을 이해하지 못했어요.",
    action: null,
    transaction: null,
    deleteIds: [],
    deleteCriteria: null,
  };

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ...empty, reply: text.trim() || empty.reply };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<GeminiResult>;
    if (!parsed.reply) {
      return empty;
    }

    const result: GeminiResult = {
      reply: parsed.reply,
      action: parsed.action === "create" || parsed.action === "delete" ? parsed.action : null,
      transaction: null,
      deleteIds: Array.isArray(parsed.deleteIds) ? parsed.deleteIds.filter(Boolean) : [],
      deleteCriteria: parsed.deleteCriteria ?? null,
    };

    if (parsed.action === "create" && parsed.transaction) {
      const { type, date, amount, description } = parsed.transaction;
      const normalizedDate = normalizeDate(date);

      if (
        (type === "expense" || type === "income") &&
        normalizedDate &&
        description?.trim() &&
        Number.isFinite(amount) &&
        amount > 0
      ) {
        result.transaction = {
          type: type === "income" ? "income" : "expense",
          date: normalizedDate,
          amount: Math.round(amount),
          description: description.trim(),
        };
      } else {
        result.action = null;
        result.reply =
          "날짜나 금액을 정확히 파악하지 못했어요. 예: \"어제 택시 2만원\"처럼 다시 말씀해 주세요.";
      }
    }

    if (parsed.action === "delete" && parsed.deleteCriteria) {
      const criteria: DeleteCriteria = { ...parsed.deleteCriteria };

      if (criteria.date) {
        const normalizedDate = normalizeDate(criteria.date);
        if (!normalizedDate) {
          return {
            ...empty,
            reply: "삭제할 날짜를 정확히 파악하지 못했어요. 다시 말씀해 주세요.",
          };
        }
        criteria.date = normalizedDate;
      }

      if (criteria.type !== "income" && criteria.type !== "expense") {
        delete criteria.type;
      }

      result.deleteCriteria = criteria;
    }

    return result;
  } catch {
    return { ...empty, reply: "응답을 이해하지 못했어요. 다시 시도해 주세요." };
  }
}

function resolveDeleteIds(records: Expense[], parsed: GeminiResult) {
  const validIds = parsed.deleteIds.filter((id) =>
    records.some((record) => record.id === id),
  );

  if (validIds.length > 0) {
    return validIds;
  }

  if (!parsed.deleteCriteria) {
    return [];
  }

  return findRecordsToDelete(records, parsed.deleteCriteria).map(
    (record) => record.id,
  );
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.gemini_api_key;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API 키가 설정되지 않았습니다. .env.local을 확인해 주세요." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      message: string;
      history?: ChatMessage[];
      records?: Expense[];
    };

    const { message, history = [], records = [] } = body;
    if (!message?.trim()) {
      return NextResponse.json({ error: "메시지를 입력해 주세요." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction: buildSystemPrompt(records),
    });

    const chat = model.startChat({
      history: sanitizeHistory(history),
    });

    const result = await chat.sendMessage(message.trim());
    const parsed = parseGeminiResponse(result.response.text());

    if (parsed.action === "delete") {
      const idsToDelete = resolveDeleteIds(records, parsed);

      if (idsToDelete.length === 0) {
        return NextResponse.json({
          reply:
            "삭제할 내역을 찾지 못했어요. 날짜, 금액, 내용을 조금 더 구체적으로 말씀해 주세요.",
          action: "delete",
          deletedIds: [],
          deleted: false,
        });
      }

      const { data: deletedIds, error: deleteError } =
        await deleteTransactions(idsToDelete);

      if (deleteError || deletedIds.length === 0) {
        return NextResponse.json({
          reply: `삭제에 실패했어요. (${deleteError?.message || "데이터베이스 오류"})`,
          action: "delete",
          deletedIds: [],
          deleted: false,
        });
      }

      return NextResponse.json({
        reply: parsed.reply,
        action: "delete",
        deletedIds,
        deleted: true,
      });
    }

    if (parsed.action === "create" && parsed.transaction) {
      const { data: saved, error: saveError } = await insertTransaction(
        parsed.transaction,
      );

      if (saveError || !saved) {
        return NextResponse.json({
          reply: `${parsed.reply}\n\n(저장 실패: ${saveError?.message || "데이터베이스 오류"})`,
          action: "create",
          transaction: parsed.transaction,
          saved: false,
        });
      }

      return NextResponse.json({
        reply: parsed.reply,
        action: "create",
        transaction: saved,
        saved: true,
      });
    }

    return NextResponse.json({
      reply: parsed.reply,
      action: null,
      saved: false,
      deleted: false,
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    const message =
      error instanceof Error && error.message.includes("API key")
        ? "Gemini API 키가 올바르지 않습니다."
        : "AI 응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
