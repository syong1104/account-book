"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import TransactionCards from "@/components/TransactionCards";
import { formatAmount, formatTime, todayString, yesterdayString } from "@/lib/format";
import {
  Expense,
  normalizeType,
  supabase,
} from "@/lib/supabase";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

function getDailyTotals(records: Expense[], date: string) {
  const dayRecords = records.filter((record) => record.date === date);
  const expense = dayRecords
    .filter((record) => record.type === "expense")
    .reduce((sum, record) => sum + record.amount, 0);
  const income = dayRecords
    .filter((record) => record.type === "income")
    .reduce((sum, record) => sum + record.amount, 0);

  return { expense, income };
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    time: formatTime(),
  };
}

export default function Home() {
  const [records, setRecords] = useState<Expense[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "assistant",
      "안녕하세요! 성용이의 가계부 챗봇이에요. 자연스럽게 말해 주세요.\n예: \"오늘 점심 8500원 썼어\", \"어제 택시 2만원 삭제해줘\"",
    ),
  ]);
  const [input, setInput] = useState("");
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recordsRef = useRef<Expense[]>(records);

  recordsRef.current = records;

  const expenseRecords = useMemo(
    () => records.filter((record) => record.type === "expense"),
    [records],
  );
  const incomeRecords = useMemo(
    () => records.filter((record) => record.type === "income"),
    [records],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error) {
        setRecords(
          (data ?? []).map((record) => ({
            ...record,
            type: normalizeType(record.type),
          })),
        );
      }

      setIsLoadingRecords(false);
    }

    loadRecords();
  }, []);

  useEffect(() => {
    if (isLoadingRecords) return;

    function appendAssistantMessage(content: string) {
      setMessages((prev) => [...prev, createMessage("assistant", content)]);
    }

    const today = todayString();
    const todayKey = `daily-summary-${today}`;
    if (!localStorage.getItem(todayKey)) {
      const { expense, income } = getDailyTotals(records, today);
      appendAssistantMessage(
        `오늘(${today}) 현재 지출 ${formatAmount(expense)}원, 수입 ${formatAmount(income)}원이에요.`,
      );
      localStorage.setItem(todayKey, "1");
    }

    function showMidnightSummary() {
      const yesterday = yesterdayString();
      const storageKey = `midnight-summary-${yesterday}`;
      if (localStorage.getItem(storageKey)) return;

      const { expense, income } = getDailyTotals(recordsRef.current, yesterday);
      appendAssistantMessage(
        `자정이에요. 어제(${yesterday}) 지출 ${formatAmount(expense)}원, 수입 ${formatAmount(income)}원이었어요.`,
      );
      localStorage.setItem(storageKey, "1");
    }

    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const delay = nextMidnight.getTime() - now.getTime();

      return window.setTimeout(() => {
        showMidnightSummary();
        localStorage.removeItem(`daily-summary-${todayString()}`);
        scheduleMidnight();
      }, delay);
    };

    const timerId = scheduleMidnight();
    return () => window.clearTimeout(timerId);
  }, [isLoadingRecords, records]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMessage = createMessage("user", trimmed);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const history = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: history.slice(0, -1),
          records,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          createMessage("assistant", data.error || "응답을 가져오지 못했어요."),
        ]);
        return;
      }

      if (data.saved && data.transaction) {
        setRecords((prev) => [data.transaction as Expense, ...prev]);
      }

      if (data.deleted && Array.isArray(data.deletedIds)) {
        const deletedSet = new Set(data.deletedIds as string[]);
        setRecords((prev) => prev.filter((record) => !deletedSet.has(record.id)));
      }

      setMessages((prev) => [...prev, createMessage("assistant", data.reply)]);
    } catch {
      setMessages((prev) => [
        ...prev,
        createMessage("assistant", "네트워크 오류가 발생했어요. 다시 시도해 주세요."),
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#f5f5f7]">
      <header className="shrink-0 border-b border-neutral-200/80 bg-white px-4 py-4">
        <h1 className="text-center text-[17px] font-semibold text-neutral-900">
          성용이의 가계부 챗봇
        </h1>
      </header>

      {!isLoadingRecords && (
        <TransactionCards
          expenseRecords={expenseRecords}
          incomeRecords={incomeRecords}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "rounded-br-md bg-accent text-white"
                    : "rounded-bl-md bg-white text-neutral-900"
                }`}
              >
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {message.content}
                </p>
                <p
                  className={`mt-1.5 text-[11px] ${
                    message.role === "user" ? "text-white/70" : "text-neutral-400"
                  }`}
                >
                  {message.time}
                </p>
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3">
                <p className="text-[15px] text-neutral-400">입력 중...</p>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-neutral-200/80 bg-white px-4 py-3"
      >
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="메시지를 입력하세요"
            className="min-h-[48px] flex-1 rounded-2xl bg-neutral-100 px-4 py-3 text-[16px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:bg-neutral-50 focus:outline focus:outline-2 focus:outline-accent/20"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="min-h-[48px] shrink-0 touch-manipulation rounded-2xl bg-accent px-5 text-[15px] font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}
