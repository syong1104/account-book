import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/env";
import { categorizeDescription } from "@/lib/categorize";
import { todayString } from "@/lib/format";
import {
  deleteTransactions,
  Expense,
  fetchAllRecords,
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

type ChatAction = "create" | "delete" | "query" | null;

type GeminiResult = {
  reply: string;
  action: ChatAction;
  transaction: TransactionData | null;
  deleteIds: string[];
  deleteCriteria: DeleteCriteria | null;
};

function formatRecordsForPrompt(records: Expense[]) {
  if (records.length === 0) return "내역 없음";

  return records
    .map(
      (record) =>
        `- [${record.type === "income" ? "수입" : "지출"}] ${record.date} ${record.description} ${record.amount}원`,
    )
    .join("\n");
}

function buildSystemPrompt(records: Expense[]) {
  const recent = records
    .slice(0, 30)
    .map(
      (record) =>
        `- [id:${record.id}] [${record.type === "income" ? "수입" : "지출"}] ${record.date} ${record.description} ${record.amount}원`,
    )
    .join("\n");

  return `당신은 "성용이의 가계부 챗봇"입니다. 사용자 메시지의 의도를 분류합니다.

오늘 날짜: ${todayString()}

최근 내역 (삭제 시 id 사용):
${recent || "없음"}

의도 분류 규칙 (우선순위 순):
1. 삭제 의도 ("삭제", "지워", "취소") → action: "delete"
2. 통계/조회 질문 ("얼마", "뭐", "어떻게", "몇", "가장", "총", "?", "알려줘" 등) → action: "query"
3. 금액 + 지출/수입 기록 ("~원 썼어", "들어왔어", "샀어") → action: "create"
4. 인사/잡담 → action: null

중요:
- "이번 달 총 지출이 얼마야?" → query (기록 아님)
- "오늘 점심 15000원" → create (금액 + 기록)
- "어제 뭐 샀더라?" → query
- "택시 2만원 삭제해줘" → delete

query일 때 reply는 간단한 확인 문구만 작성하세요. 실제 분석 답변은 별도로 생성됩니다.

반드시 JSON 형식으로만 응답하세요:

기록: {"reply":"저장할게요!","action":"create","transaction":{"type":"expense","date":"2026-09-02","amount":15000,"description":"점심"},"deleteIds":[],"deleteCriteria":null}
삭제: {"reply":"삭제할게요!","action":"delete","transaction":null,"deleteIds":["id"],"deleteCriteria":null}
질문: {"reply":"확인해볼게요!","action":"query","transaction":null,"deleteIds":[],"deleteCriteria":null}
일반: {"reply":"안녕하세요!","action":null,"transaction":null,"deleteIds":[],"deleteCriteria":null}`;
}

function buildQueryPrompt(records: Expense[], question: string) {
  return `당신은 친근한 가계부 통계 분석 도우미입니다.
사용자의 질문에 대해 아래 내역 데이터를 분석해 자연스럽고 친근한 한국어로 답변하세요.

오늘 날짜: ${todayString()}

전체 내역:
${formatRecordsForPrompt(records)}

사용자 질문: ${question}

답변 규칙:
1. 금액은 천 단위 콤마를 사용하세요 (예: 15,000원)
2. 데이터가 없으면 솔직하게 알려주세요
3. 구체적인 숫자와 항목을 포함해 답변하세요
4. 2~4문장 정도로 간결하고 친근하게 답변하세요
5. JSON이 아닌 일반 텍스트로만 답변하세요`;
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

    const action =
      parsed.action === "create" ||
      parsed.action === "delete" ||
      parsed.action === "query"
        ? parsed.action
        : null;

    const result: GeminiResult = {
      reply: parsed.reply,
      action,
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

async function answerQuery(
  genAI: GoogleGenerativeAI,
  records: Expense[],
  question: string,
) {
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  const result = await model.generateContent(buildQueryPrompt(records, question));
  return result.response.text().trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = getGeminiApiKey();
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

    if (parsed.action === "query") {
      const { data: allRecords, error: fetchError } = await fetchAllRecords();

      if (fetchError) {
        return NextResponse.json({
          reply: "내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          action: "query",
        });
      }

      const reply = await answerQuery(genAI, allRecords, message.trim());

      return NextResponse.json({
        reply,
        action: "query",
      });
    }

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
      const category =
        parsed.transaction.type === "expense"
          ? await categorizeDescription(parsed.transaction.description)
          : "기타";

      const { data: saved, error: saveError } = await insertTransaction({
        ...parsed.transaction,
        category,
      });

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
