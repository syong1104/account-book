alter table public.expenses enable row level security;

create policy "Allow public delete"
  on public.expenses for delete
  using (true);
