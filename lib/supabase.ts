import { Category, normalizeCategory } from "@/lib/categories";
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
  category: Category;
};

export function normalizeType(type: unknown): TransactionType {
  return type === "income" ? "income" : "expense";
}

export function normalizeRecord(record: Record<string, unknown>): Expense {
  return {
    id: record.id as string,
    created_at: record.created_at as string,
    date: record.date as string,
    amount: record.amount as number,
    description: record.description as string,
    type: normalizeType(record.type),
    category: normalizeCategory(record.category),
  };
}

export async function insertTransaction({
  date,
  amount,
  description,
  type,
  category,
}: {
  date: string;
  amount: number;
  description: string;
  type: TransactionType;
  category?: Category;
}) {
  const payload = {
    date,
    amount,
    description: description.trim(),
    type,
    category: category ?? (type === "expense" ? "기타" : "기타"),
  };

  const result = await supabase.from("expenses").insert(payload).select().single();

  if (!result.error && result.data) {
    return { data: normalizeRecord(result.data), error: null };
  }

  const isMissingColumn =
    result.error?.code === "PGRST204" &&
    (result.error.message.includes("'category'") ||
      result.error.message.includes("'type'"));

  if (isMissingColumn) {
    const fallback = await supabase
      .from("expenses")
      .insert({ date, amount, description: description.trim(), type })
      .select()
      .single();

    if (fallback.error || !fallback.data) {
      return { data: null, error: fallback.error };
    }

    return {
      data: normalizeRecord({ ...fallback.data, category: category ?? "기타" }),
      error: null,
    };
  }

  return { data: null, error: result.error };
}

export async function deleteTransactions(ids: string[]) {
  if (ids.length === 0) {
    return { data: [] as string[], error: new Error("삭제할 내역이 없습니다.") };
  }

  const { error } = await supabase.from("expenses").delete().in("id", ids);

  if (error) {
    return { data: [], error };
  }

  return { data: ids, error: null };
}

export function findRecordsToDelete(
  records: Expense[],
  criteria: {
    type?: TransactionType;
    date?: string;
    amount?: number;
    description?: string;
  },
) {
  return records.filter((record) => {
    if (criteria.type && record.type !== criteria.type) return false;
    if (criteria.date && record.date !== criteria.date) return false;
    if (criteria.amount && record.amount !== criteria.amount) return false;
    if (
      criteria.description &&
      !record.description
        .toLowerCase()
        .includes(criteria.description.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
}

export async function fetchAllRecords() {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [] as Expense[], error };
  }

  return {
    data: (data ?? []).map((record) => normalizeRecord(record)),
    error: null,
  };
}
