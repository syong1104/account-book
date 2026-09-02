alter table public.expenses
add column if not exists category text not null default '기타'
check (category in ('식비', '교통', '쇼핑', '문화', '기타'));
