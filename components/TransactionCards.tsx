import { Category, CATEGORY_COLORS } from "@/lib/categories";
import { Expense } from "@/lib/supabase";
import { formatAmount } from "@/lib/format";

function sumAmount(items: Expense[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function TransactionGroup({
  title,
  items,
  total,
  accentClass,
}: {
  title: string;
  items: Expense[];
  total: number;
  accentClass: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-white p-2.5 md:max-w-[320px] md:p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold md:text-[12px] ${accentClass}`}>
          {title}
        </span>
        <span className="font-mono text-[11px] font-medium tabular-nums text-neutral-900 md:text-[12px]">
          {formatAmount(total)}
          <span className="ml-0.5 font-sans font-normal text-neutral-400">원</span>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-neutral-400">내역 없음</p>
      ) : (
        <ul className="max-h-24 space-y-1 overflow-y-auto md:max-h-28">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg bg-neutral-50 px-2 py-1.5 md:px-2.5 md:py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.type === "expense" && (
                      <span
                        className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium text-white md:text-[10px]"
                        style={{ background: CATEGORY_COLORS[item.category] }}
                      >
                        {item.category}
                      </span>
                    )}
                    <p className="truncate text-[11px] font-medium text-neutral-900 md:text-[12px]">
                      {item.description}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-neutral-400">{item.date}</p>
                </div>
                <p className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-neutral-800 md:text-[12px]">
                  {formatAmount(item.amount)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TransactionCards({
  expenseRecords,
  incomeRecords,
  selectedCategory,
  onCategoryChange,
}: {
  expenseRecords: Expense[];
  incomeRecords: Expense[];
  selectedCategory: Category | "전체";
  onCategoryChange: (category: Category | "전체") => void;
}) {
  const filteredExpenses =
    selectedCategory === "전체"
      ? expenseRecords
      : expenseRecords.filter((record) => record.category === selectedCategory);

  return (
    <div className="border-b border-neutral-100 bg-[#f5f5f7] px-3 py-2 md:px-4 md:py-2.5">
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {(["전체", "식비", "교통", "쇼핑", "문화", "기타"] as const).map(
          (category) => (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition md:px-3 md:text-[11px] ${
                selectedCategory === category
                  ? "bg-accent text-white"
                  : "bg-white text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {category}
            </button>
          ),
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto md:gap-3">
        <TransactionGroup
          title="지출"
          items={filteredExpenses}
          total={sumAmount(filteredExpenses)}
          accentClass="text-neutral-700"
        />
        <TransactionGroup
          title="수입"
          items={incomeRecords}
          total={sumAmount(incomeRecords)}
          accentClass="text-accent"
        />
      </div>
    </div>
  );
}
