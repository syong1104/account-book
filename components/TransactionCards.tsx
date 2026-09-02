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
    <div className="min-w-[280px] flex-1 rounded-2xl bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`text-[13px] font-semibold ${accentClass}`}>{title}</span>
        <span className="font-mono text-sm font-medium tabular-nums text-neutral-900">
          {formatAmount(total)}
          <span className="ml-0.5 font-sans text-[12px] font-normal text-neutral-400">
            원
          </span>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-neutral-400">내역 없음</p>
      ) : (
        <ul className="max-h-36 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl bg-neutral-50 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-neutral-900">
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-[12px] text-neutral-400">{item.date}</p>
                </div>
                <p className="shrink-0 font-mono text-[14px] font-medium tabular-nums text-neutral-800">
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
}: {
  expenseRecords: Expense[];
  incomeRecords: Expense[];
}) {
  return (
    <div className="border-b border-neutral-100 bg-[#f5f5f7] px-4 py-4">
      <div className="flex gap-3 overflow-x-auto pb-1">
        <TransactionGroup
          title="지출"
          items={expenseRecords}
          total={sumAmount(expenseRecords)}
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
