"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORY_COLORS, Category } from "@/lib/categories";
import { formatAmount } from "@/lib/format";
import { Expense } from "@/lib/supabase";

export default function ExpenseCharts({ records }: { records: Expense[] }) {
  const expenses = records.filter((record) => record.type === "expense");

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();

    for (const record of expenses) {
      const month = record.date.slice(0, 7);
      map.set(month, (map.get(month) ?? 0) + record.amount);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, total]) => ({
        month: month.replace("-", "년 ") + "월",
        total,
      }));
  }, [expenses]);

  const categoryData = useMemo(() => {
    const map = new Map<Category, number>();

    for (const record of expenses) {
      map.set(record.category, (map.get(record.category) ?? 0) + record.amount);
    }

    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  if (expenses.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-neutral-100 bg-[#f5f5f7] px-3 py-3 md:grid-cols-2 md:px-4 md:py-3">
      <div className="rounded-xl bg-white p-3 md:p-4">
        <h3 className="mb-2 text-[12px] font-medium text-neutral-500 md:text-[13px]">
          월별 지출
        </h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={monthlyData}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) => value.replace("년 ", "/").replace("월", "")}
            />
            <YAxis hide />
            <Tooltip
              formatter={(value) => [`${formatAmount(Number(value))}원`, "지출"]}
            />
            <Bar dataKey="total" fill="#0071e3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl bg-white p-3 md:p-4">
        <h3 className="mb-2 text-[12px] font-medium text-neutral-500 md:text-[13px]">
          카테고리별 지출
        </h3>
        <ResponsiveContainer width="100%" height={120}>
          <PieChart>
            <Pie
              data={categoryData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={50}
              paddingAngle={2}
            >
              {categoryData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={CATEGORY_COLORS[entry.name as Category]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${formatAmount(Number(value))}원`, ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {categoryData.map((item) => (
            <span
              key={item.name}
              className="text-[10px] text-neutral-500 md:text-[11px]"
            >
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ background: CATEGORY_COLORS[item.name as Category] }}
              />
              {item.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
