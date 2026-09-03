-- Run once: npm run migrate
-- Idempotent. Safe to re-run.

create table if not exists xishui_prices (
  trade_date   date        not null,
  weight_jin   smallint    not null,           -- 30..46
  price        integer     not null,           -- RMB per 件 (360枚)
  price_prev   integer,                        -- 昨日蛋价 as printed on the page
  source_url   text        not null,
  scraped_at   timestamptz not null default now(),
  primary key (trade_date, weight_jin)
);

create table if not exists regional_quotes (
  trade_date   date        not null,
  province     text        not null,           -- as titled on jbzyw (山东 / 辽宁 / 北京 ...)
  city         text        not null,
  price        numeric     not null,
  unit         text        not null,           -- '斤' | '45斤' | '44斤' | '30斤' | '27.5斤' ...
  trend        text        not null,           -- 稳 | 落 | 涨
  raw          text        not null,           -- original clause, kept for audit
  source_url   text        not null,
  scraped_at   timestamptz not null default now(),
  primary key (trade_date, province, city, unit)
);

create table if not exists reports (
  trade_date   date        primary key,
  report_md    text        not null,
  zones        jsonb,                          -- {"support":[[229,235]],"resistance":[[239,243],[245,248]]}
  created_at   timestamptz not null default now()
);

create index if not exists xishui_prices_date_idx on xishui_prices (trade_date desc);
create index if not exists regional_quotes_date_idx on regional_quotes (trade_date desc);
