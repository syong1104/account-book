"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import BudgetSettings from "@/components/BudgetSettings";
import ExpenseCharts from "@/components/ExpenseCharts";
import TransactionCards from "@/components/TransactionCards";
import { Category } from "@/lib/categories";
import { formatAmount, formatTime, todayString, yesterdayString } from "@/lib/format";
import {
  Expense,
  normalizeRecord,
  supabase,
} from "@/lib/supabase";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

type SpeechRecognitionEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
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

function getMonthlyExpense(records: Expense[]) {
  const month = todayString().slice(0, 7);
  return records
    .filter((record) => record.type === "expense" && record.date.startsWith(month))
    .reduce((sum, record) => sum + record.amount, 0);
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
      "안녕하세요! 성용이의 가계부 챗봇이에요.\n\n📝 기록: \"오늘 점심 8500원 썼어\"\n📊 질문: \"이번 달 총 지출이 얼마야?\"\n🎤 음성 / 📷 영수증도 지원해요!",
    ),
  ]);
  const [input, setInput] = useState("");
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | "전체">("전체");
  const [budget, setBudget] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recordsRef = useRef<Expense[]>(records);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesRef = useRef(messages);

  recordsRef.current = records;
  messagesRef.current = messages;

  const expenseRecords = useMemo(
    () => records.filter((record) => record.type === "expense"),
    [records],
  );
  const incomeRecords = useMemo(
    () => records.filter((record) => record.type === "income"),
    [records],
  );
  const monthlyExpense = useMemo(() => getMonthlyExpense(records), [records]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    const saved = localStorage.getItem("monthly-budget");
    if (saved) setBudget(Number(saved));
  }, []);

  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error) {
        setRecords((data ?? []).map((record) => normalizeRecord(record)));
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

    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const delay = nextMidnight.getTime() - now.getTime();

      return window.setTimeout(() => {
        const yesterday = yesterdayString();
        const { expense, income } = getDailyTotals(recordsRef.current, yesterday);
        appendAssistantMessage(
          `자정이에요. 어제(${yesterday}) 지출 ${formatAmount(expense)}원, 수입 ${formatAmount(income)}원이었어요.`,
        );
        localStorage.removeItem(`daily-summary-${todayString()}`);
        scheduleMidnight();
      }, delay);
    };

    const timerId = scheduleMidnight();
    return () => window.clearTimeout(timerId);
  }, [isLoadingRecords, records]);

  function handleBudgetChange(value: number) {
    setBudget(value);
    localStorage.setItem("monthly-budget", String(value));
  }

  async function sendChatMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const userMessage = createMessage("user", trimmed);
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const history = [...messagesRef.current, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: history.slice(0, -1),
          records: recordsRef.current,
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

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendChatMessage(trimmed);
  }

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition;

    if (!SpeechRecognition) {
      setMessages((prev) => [
        ...prev,
        createMessage("assistant", "이 브라우저는 음성 인식을 지원하지 않아요."),
      ]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      sendChatMessage(transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  async function handleReceiptUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessages((prev) => [
      ...prev,
      createMessage("user", "📷 영수증 사진을 업로드했어요."),
    ]);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          createMessage("assistant", data.error || "영수증 분석에 실패했어요."),
        ]);
        return;
      }

      if (data.saved && data.transaction) {
        setRecords((prev) => [data.transaction as Expense, ...prev]);
      }

      setMessages((prev) => [...prev, createMessage("assistant", data.reply)]);
    } catch {
      setMessages((prev) => [
        ...prev,
        createMessage("assistant", "영수증 업로드에 실패했어요."),
      ]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f5f5f7]">
      <header className="z-10 shrink-0 border-b border-neutral-200/80 bg-white px-3 py-3 md:px-4 md:py-3">
        <h1 className="text-center text-[15px] font-semibold text-neutral-900 md:text-[16px]">
          성용이의 가계부 챗봇
        </h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-4xl">
          {!isLoadingRecords && (
            <>
              <BudgetSettings
                budget={budget}
                currentExpense={monthlyExpense}
                onBudgetChange={handleBudgetChange}
              />
              <ExpenseCharts records={records} />
              <TransactionCards
                expenseRecords={expenseRecords}
                incomeRecords={incomeRecords}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            </>
          )}
        </div>

        <div className="px-3 py-3 md:px-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2.5 md:gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 md:max-w-[75%] md:px-4 md:py-3 ${
                    message.role === "user"
                      ? "rounded-br-md bg-accent text-white"
                      : "rounded-bl-md bg-white text-neutral-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed md:text-[15px]">
                    {message.content}
                  </p>
                  <p
                    className={`mt-1 text-[10px] md:text-[11px] ${
                      message.role === "user" ? "text-white/70" : "text-neutral-400"
                    }`}
                  >
                    {message.time}
                  </p>
                </div>
              </div>
            ))}

            {(isSending || isUploading) && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 md:px-4 md:py-3">
                  <p className="text-[14px] text-neutral-400 md:text-[15px]">
                    {isUploading ? "영수증 분석 중..." : "입력 중..."}
                  </p>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>
      </main>

      <form
        onSubmit={handleSend}
        className="z-10 shrink-0 border-t border-neutral-200/80 bg-white px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:px-4 md:pt-3"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-1.5 md:gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleReceiptUpload}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-[16px] transition hover:bg-neutral-200 disabled:opacity-40 md:h-11 md:w-11"
            title="영수증 업로드"
          >
            📷
          </button>

          <button
            type="button"
            onClick={toggleVoice}
            disabled={isSending || isUploading}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[16px] transition disabled:opacity-40 md:h-11 md:w-11 ${
              isListening
                ? "bg-red-100 text-red-500"
                : "bg-neutral-100 hover:bg-neutral-200"
            }`}
            title="음성 입력"
          >
            🎤
          </button>

          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="메시지를 입력하세요"
            className="h-10 min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 text-[15px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:bg-neutral-50 focus:outline focus:outline-2 focus:outline-accent/20 md:h-11 md:px-4 md:text-[16px]"
            disabled={isSending || isUploading}
          />

          <button
            type="submit"
            disabled={!input.trim() || isSending || isUploading}
            className="h-10 shrink-0 touch-manipulation rounded-xl bg-accent px-4 text-[14px] font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 md:h-11 md:px-5 md:text-[15px]"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}
