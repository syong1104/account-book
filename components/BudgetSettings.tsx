"use client";

import { formatAmount } from "@/lib/format";

type BudgetSettingsProps = {
  budget: number;
  currentExpense: number;
  onBudgetChange: (budget: number) => void;
};

export default function BudgetSettings({
  budget,
  currentExpense,
  onBudgetChange,
}: BudgetSettingsProps) {
  const ratio = budget > 0 ? (currentExpense / budget) * 100 : 0;
  const isWarning = ratio >= 80;
  const isOver = ratio >= 100;

  return (
    <div className="border-b border-neutral-100 bg-white px-3 py-2.5 md:px-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="budget" className="shrink-0 text-[12px] text-neutral-500">
            월 예산
          </label>
          <input
            id="budget"
            type="number"
            min="0"
            step="10000"
            value={budget || ""}
            onChange={(event) => onBudgetChange(Number(event.target.value))}
            placeholder="0"
            className="w-24 rounded-lg bg-neutral-100 px-2 py-1 text-[13px] outline-none focus:ring-2 focus:ring-accent/20 md:w-28"
          />
          <span className="text-[12px] text-neutral-400">원</span>
        </div>

        {budget > 0 && (
          <div className="text-right">
            <p className="font-mono text-[12px] tabular-nums text-neutral-700 md:text-[13px]">
              {formatAmount(currentExpense)} / {formatAmount(budget)}원
            </p>
            <p
              className={`text-[11px] font-medium ${
                isOver
                  ? "text-red-500"
                  : isWarning
                    ? "text-orange-500"
                    : "text-neutral-400"
              }`}
            >
              {ratio.toFixed(0)}% 사용
            </p>
          </div>
        )}
      </div>

      {budget > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full transition-all ${
              isOver ? "bg-red-500" : isWarning ? "bg-orange-400" : "bg-accent"
            }`}
            style={{ width: `${Math.min(ratio, 100)}%` }}
          />
        </div>
      )}

      {isWarning && (
        <p
          className={`mt-1.5 text-[11px] md:text-[12px] ${
            isOver ? "text-red-500" : "text-orange-500"
          }`}
        >
          {isOver
            ? "⚠️ 예산을 초과했어요! 지출을 줄여보세요."
            : "⚠️ 예산의 80% 이상을 사용했어요."}
        </p>
      )}
    </div>
  );
}
