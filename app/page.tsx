"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Expense, insertTransaction, normalizeType, supabase, TransactionType } from "@/lib/supabase";

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function sumAmount(items: Expense[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

const inputClassName =
  "w-full min-h-[52px] rounded-xl bg-neutral-100/80 px-4 py-4 text-lg text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:bg-white focus:outline focus:outline-2 focus:outline-accent/30 sm:min-h-0 sm:py-3.5 sm:text-base";

function TransactionSection({
  title,
  items,
  total,
  emptyMessage,
}: {
  title: string;
  items: Expense[];
  total: number;
  emptyMessage: string;
}) {
  return (
    <section className="mb-14 last:mb-0">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-[13px] font-medium uppercase tracking-wider text-neutral-400">
          {title}
        </h2>
        <p className="shrink-0 font-mono text-lg font-medium tabular-nums tracking-tight text-neutral-900 sm:text-base">
          {formatAmount(total)}
          <span className="ml-0.5 text-[13px] font-sans font-normal text-neutral-400">
            원
          </span>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-neutral-400">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl bg-white px-5 py-5 sm:px-6 sm:py-6"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-medium leading-snug text-neutral-900 sm:text-base">
                    {item.description}
                  </p>
                  <p className="mt-1.5 text-[14px] text-neutral-400">
                    {item.date}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-xl font-medium tabular-nums tracking-tight text-neutral-900 sm:text-lg">
                  {formatAmount(item.amount)}
                  <span className="ml-0.5 text-[14px] font-sans font-normal text-neutral-400">
                    원
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Home() {
  const [date, setDate] = useState(todayString);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [records, setRecords] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseRecords = useMemo(
    () => records.filter((record) => record.type === "expense"),
    [records],
  );
  const incomeRecords = useMemo(
    () => records.filter((record) => record.type === "income"),
    [records],
  );
  const expenseTotal = useMemo(() => sumAmount(expenseRecords), [expenseRecords]);
  const incomeTotal = useMemo(() => sumAmount(incomeRecords), [incomeRecords]);

  useEffect(() => {
    async function loadRecords() {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError("내역을 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      setRecords(
        (data ?? []).map((record) => ({
          ...record,
          type: normalizeType(record.type),
        })),
      );
      setIsLoading(false);
    }

    loadRecords();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = Number(amount.replace(/,/g, ""));
    if (!date || !description.trim() || !parsedAmount || parsedAmount <= 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const { data, error: insertError } = await insertTransaction({
      date,
      amount: parsedAmount,
      description: description.trim(),
      type,
    });

    setIsSaving(false);

    if (insertError) {
      setError(insertError.message || "내역을 저장하지 못했습니다.");
      return;
    }

    if (data) {
      setRecords((prev) => [data, ...prev]);
    }

    setDate(todayString());
    setAmount("");
    setDescription("");
  }

  return (
    <div className="min-h-full w-full bg-background px-5 py-12 sm:px-8 sm:py-20">
      <main className="mx-auto w-full max-w-md">
        <header className="mb-14 sm:mb-16">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            나의 AI 가계부
          </h1>
          <p className="mt-3 text-base leading-relaxed text-neutral-500 sm:text-[15px]">
            수입과 지출을 기록하고 관리해 보세요.
          </p>
        </header>

        <section className="mb-16 rounded-2xl bg-white px-5 py-8 sm:px-8 sm:py-10">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2.5">
              <span className="block text-[13px] font-medium text-neutral-500">
                구분
              </span>
              <div className="flex rounded-xl bg-neutral-100/80 p-1">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`min-h-[48px] flex-1 touch-manipulation rounded-lg text-[15px] font-medium transition sm:min-h-0 sm:py-2.5 sm:text-sm ${
                    type === "expense"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  지출
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`min-h-[48px] flex-1 touch-manipulation rounded-lg text-[15px] font-medium transition sm:min-h-0 sm:py-2.5 sm:text-sm ${
                    type === "income"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  수입
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <label
                htmlFor="date"
                className="block text-[13px] font-medium text-neutral-500"
              >
                날짜
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div className="space-y-2.5">
              <label
                htmlFor="amount"
                className="block text-[13px] font-medium text-neutral-500"
              >
                금액
              </label>
              <input
                id="amount"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className={`${inputClassName} font-mono tabular-nums`}
                required
              />
            </div>

            <div className="space-y-2.5">
              <label
                htmlFor="description"
                className="block text-[13px] font-medium text-neutral-500"
              >
                내용
              </label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  type === "expense" ? "점심 식사, 교통비" : "월급, 용돈"
                }
                className={inputClassName}
                required
              />
            </div>

            {error && <p className="text-[15px] text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full min-h-[52px] touch-manipulation rounded-xl bg-accent px-4 py-4 text-[17px] font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-3.5 sm:text-base"
            >
              {isSaving ? "저장 중..." : "저장하기"}
            </button>
          </form>
        </section>

        {isLoading ? (
          <p className="py-12 text-center text-[15px] text-neutral-400">
            불러오는 중...
          </p>
        ) : (
          <>
            <TransactionSection
              title="최근 지출 내역"
              items={expenseRecords}
              total={expenseTotal}
              emptyMessage="아직 등록된 지출이 없습니다."
            />
            <TransactionSection
              title="최근 수입 내역"
              items={incomeRecords}
              total={incomeTotal}
              emptyMessage="아직 등록된 수입이 없습니다."
            />
          </>
        )}
      </main>
    </div>
  );
}
