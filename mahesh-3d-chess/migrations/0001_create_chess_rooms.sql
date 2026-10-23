-- Run this in the Supabase SQL Editor before deploying to Vercel.
create table if not exists public.chess_rooms (
  code text primary key,
  white_token text not null,
  black_token text,
  fen text not null,
  pgn text not null default '',
  turn text not null default 'w' check (turn in ('w','b')),
  clock_minutes integer not null default 5 check (clock_minutes in (5,10)),
  white_ms bigint not null default 300000,
  black_ms bigint not null default 300000,
  clock_started_at timestamptz,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  result text,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists chess_rooms_updated_at_idx on public.chess_rooms(updated_at);
-- Do not expose this table to anonymous clients. The Vercel API uses the service-role key server-side.
alter table public.chess_rooms enable row level security;
