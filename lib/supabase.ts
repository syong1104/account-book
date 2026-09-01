import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type TransactionType = "income" | "expense";

export type Expense = {
  id: string;
  created_at: string;
  date: string;
  amount: number;
  description: string;
  type: TransactionType;
};

export function normalizeType(type: unknown): TransactionType {
  return type === "income" ? "income" : "expense";
}

export async function insertTransaction({
  date,
  amount,
  description,
  type,
}: {
  date: string;
  amount: number;
  description: string;
  type: TransactionType;
}) {
  const payload = {
    date,
    amount,
    description: description.trim(),
  };

  const withType = await supabase
    .from("expenses")
    .insert({ ...payload, type })
    .select()
    .single();

  if (!withType.error && withType.data) {
    return {
      data: { ...withType.data, type: normalizeType(withType.data.type) } as Expense,
      error: null,
    };
  }

  const isMissingTypeColumn =
    withType.error?.code === "PGRST204" &&
    withType.error.message.includes("'type'");

  if (isMissingTypeColumn) {
    if (type === "income") {
      return {
        data: null,
        error: new Error(
          "수입 저장을 위해 Supabase에 type 컬럼이 필요합니다. SQL Editor에서 add_type_column.sql 쿼리를 실행해 주세요.",
        ),
      };
    }

    const withoutType = await supabase
      .from("expenses")
      .insert(payload)
      .select()
      .single();

    if (withoutType.error || !withoutType.data) {
      return { data: null, error: withoutType.error };
    }

    return {
      data: { ...withoutType.data, type: "expense" } as Expense,
      error: null,
    };
  }

  return { data: null, error: withType.error };
}
