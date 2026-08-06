-- Nhap nhat ky dau tu vao So Chi Tieu. Sinh tu du lieu goc, da doi chieu 13 moc
-- "KL tai ngay DKCC" cua chinh nhat ky -> khop het.
-- Dan TOAN BO vao SQL editor cua project roi chay MOT LAN.
-- Chay hai lan se nhan doi du lieu: cac cau kiem o cuoi se cho thay ngay.

begin;

-- 1. Tai khoan ngan hang VN (khong cong vao Tong tai san — chi lam duong dan tien)
insert into public.accounts (user_id, name, type, currency, initial_balance, include_in_totals, asset_group)
select a.user_id, 'Ngan hang VN', 'bank', 'VND', 0, false, 'Tai san Viet Nam'
from public.accounts a where a.name = 'iDragon'
  and not exists (select 1 from public.accounts b where b.name = 'Ngan hang VN' and b.user_id = a.user_id);

-- 2. Danh muc thu nhap cho co tuc tien mat
insert into public.categories (user_id, name, type, icon)
select a.user_id, 'Co tuc', 'income', '💰'
from public.accounts a where a.name = 'iDragon'
  and not exists (select 1 from public.categories c where c.name = 'Co tuc' and c.user_id = a.user_id);

-- 3. So lenh co phieu (53 dong)
insert into public.stock_trades (user_id, account_id, symbol, kind, traded_on, quantity, price, fee, tax, note)
select a.user_id, a.id, v.symbol, v.kind, v.traded_on::date, v.quantity, v.price, v.fee, v.tax, v.note
from public.accounts a, (values
  ('HPG', 'buy', '2024-01-05', 200, 27750, 13875, 0, ''),
  ('MWG', 'buy', '2024-01-05', 100, 43200, 10800, 0, ''),
  ('HPG', 'buy', '2024-02-20', 400, 29150, 29150, 0, ''),
  ('MWG', 'buy', '2024-02-20', 200, 46200, 23100, 0, ''),
  ('VND', 'buy', '2024-02-20', 500, 23150, 28937, 0, ''),
  ('HPG', 'buy', '2024-03-08', 300, 30300, 22725, 0, ''),
  ('MWG', 'buy', '2024-03-08', 300, 47750, 35812, 0, ''),
  ('VND', 'buy', '2024-03-08', 300, 23500, 17625, 0, ''),
  ('HPG', 'buy', '2024-03-21', 400, 30450, 30450, 0, ''),
  ('VND', 'buy', '2024-03-21', 400, 24000, 24000, 0, ''),
  ('HPG', 'buy', '2024-04-16', 100, 28500, 7125, 0, ''),
  ('MWG', 'buy', '2024-04-16', 100, 49500, 12375, 0, ''),
  ('VND', 'buy', '2024-04-16', 100, 20300, 5075, 0, ''),
  ('HPG', 'adjust', '2024-05-24', 140, 0, 0, 0, 'Co tuc bang co phieu / co phieu thuong'),
  ('VND', 'adjust', '2024-05-30', 65, 0, 0, 0, 'Co tuc bang co phieu / co phieu thuong'),
  ('VND', 'buy', '2024-06-17', 260, 10000, 0, 0, ''),
  ('MWG', 'buy', '2024-06-25', 300, 62000, 46500, 0, ''),
  ('HPG', 'buy', '2024-09-16', 2000, 24850, 124250, 0, ''),
  ('MWG', 'buy', '2024-09-16', 1000, 66100, 165250, 0, ''),
  ('HPG', 'buy', '2024-09-19', 1200, 25300, 75900, 0, ''),
  ('MWG', 'buy', '2024-09-19', 300, 68500, 51375, 0, ''),
  ('HPG', 'buy', '2025-01-14', 600, 25950, 38925, 0, ''),
  ('MWG', 'buy', '2025-01-14', 200, 57300, 28650, 0, ''),
  ('MBB', 'buy', '2025-01-14', 600, 21400, 32100, 0, ''),
  ('HPG', 'buy', '2025-01-17', 400, 26300, 26300, 0, ''),
  ('HPG', 'buy', '2025-01-17', 1300, 26500, 86125, 0, ''),
  ('MWG', 'buy', '2025-01-17', 200, 57300, 28650, 0, ''),
  ('MWG', 'buy', '2025-01-17', 500, 57700, 72125, 0, ''),
  ('MBB', 'buy', '2025-01-17', 300, 21500, 16125, 0, ''),
  ('MBB', 'buy', '2025-01-17', 1600, 21500, 86000, 0, ''),
  ('HPG', 'buy', '2025-02-11', 300, 25450, 19087, 0, ''),
  ('HPG', 'buy', '2025-03-20', 200, 27300, 13650, 0, ''),
  ('HPG', 'buy', '2025-03-20', 200, 27150, 13575, 0, ''),
  ('HPG', 'buy', '2025-03-27', 200, 27700, 13850, 0, ''),
  ('HPG', 'buy', '2025-04-03', 300, 25350, 19012, 0, ''),
  ('MWG', 'buy', '2025-04-03', 100, 54700, 13675, 0, ''),
  ('MBB', 'buy', '2025-04-03', 100, 22650, 5662, 0, ''),
  ('HPG', 'buy', '2025-04-04', 200, 24400, 12200, 0, ''),
  ('MWG', 'buy', '2025-04-04', 100, 51200, 12800, 0, ''),
  ('HPG', 'buy', '2025-04-09', 300, 22300, 16725, 0, ''),
  ('MWG', 'buy', '2025-04-09', 100, 49100, 12275, 0, ''),
  ('MBB', 'buy', '2025-04-09', 200, 21350, 10675, 0, ''),
  ('HPG', 'buy', '2025-05-12', 200, 25300, 12650, 0, ''),
  ('HPG', 'buy', '2025-05-23', 200, 25650, 12825, 0, ''),
  ('MWG', 'buy', '2025-05-29', 100, 63600, 15900, 0, ''),
  ('HPG', 'buy', '2025-06-16', 200, 26750, 13375, 0, ''),
  ('HPG', 'buy', '2025-06-26', 700, 23100, 40425, 0, ''),
  ('HPG', 'buy', '2025-06-26', 1100, 22950, 63112, 0, ''),
  ('HPG', 'adjust', '2025-06-27', 1868, 0, 0, 0, 'Co tuc bang co phieu / co phieu thuong'),
  ('MBB', 'adjust', '2025-08-14', 896, 0, 0, 0, 'Co tuc bang co phieu / co phieu thuong'),
  ('MWG', 'sell', '2025-12-15', 2900, 78800, 139238, 228520, 'Ban de rut tien'),
  ('HPG', 'sell', '2026-03-10', 6500, 26800, 445540, 174200, 'Ban de rut tien'),
  ('HPG', 'adjust', '2026-05-26', 650, 0, 0, 0, 'Co tuc bang co phieu / co phieu thuong')
) as v(symbol, kind, traded_on, quantity, price, fee, tax, note)
where a.name = 'iDragon';

-- 4. Nap tien: chuyen khoan Ngan hang VN -> iDragon (22 lan)
--    NGAY LA DUNG LAI, khong phai sao ke: moi khi tien sap thieu de mua thi coi nhu
--    nap dung so can vao dung ngay mua. Nhat ky goc khong co phan nap tien.
insert into public.transactions (user_id, type, amount, account_id, to_account_id, occurred_on, note)
select a.user_id, 'transfer', v.amount, b.id, a.id, v.ngay::date, 'Nap tien (ngay dung lai)'
from public.accounts a, public.accounts b, (values
  ('2024-01-05', 9894675),
  ('2024-02-20', 32556187),
  ('2024-03-08', 30541162),
  ('2024-03-21', 21834450),
  ('2024-04-16', 9854575),
  ('2024-06-17', 2600000),
  ('2024-06-25', 18646500),
  ('2024-09-16', 114904969),
  ('2024-09-19', 51037275),
  ('2025-01-14', 39969675),
  ('2025-01-17', 126445325),
  ('2025-02-11', 7654087),
  ('2025-03-20', 10917225),
  ('2025-03-27', 5553850),
  ('2025-04-03', 15378349),
  ('2025-04-04', 10025000),
  ('2025-04-09', 15909675),
  ('2025-05-12', 5072650),
  ('2025-05-23', 5142825),
  ('2025-05-29', 6375900),
  ('2025-06-16', 5363375),
  ('2025-06-26', 40785256)
) as v(ngay, amount)
where a.name = 'iDragon' and b.name = 'Ngan hang VN' and b.user_id = a.user_id;

-- 5. Rut tien: chuyen khoan iDragon -> Ngan hang VN (2 lan)
--    Ban nho "khoang thang 11-12 nam ngoai". So tien ep ra hai lan: sau moi lenh ban.
insert into public.transactions (user_id, type, amount, account_id, to_account_id, occurred_on, note)
select a.user_id, 'transfer', v.amount, a.id, b.id, v.ngay::date, 'Rut ve ngan hang (ngay dung lai)'
from public.accounts a, public.accounts b, (values
  ('2025-12-16', 228152242),
  ('2026-03-11', 124791767)
) as v(ngay, amount)
where a.name = 'iDragon' and b.name = 'Ngan hang VN' and b.user_id = a.user_id;

-- 6. Co tuc tien mat: thu nhap vao iDragon (9 khoan)
--    Ghi la THU NHAP chu khong phai chuyen khoan: day la phan danh muc tu sinh ra,
--    khong phai von moi bo vao — nho vay %/nam (XIRR) moi tinh dung.
insert into public.transactions (user_id, type, amount, account_id, category_id, occurred_on, note)
select a.user_id, 'income', v.amount, a.id, c.id, v.ngay::date, v.note
from public.accounts a, public.categories c, (values
  ('2024-07-01', 451250, 'Co tuc MWG'),
  ('2024-09-11', 733281, 'Co tuc VND'),
  ('2025-06-25', 733281, 'Co tuc VND'),
  ('2025-07-25', 3249000, 'Co tuc MWG'),
  ('2025-08-14', 758100, 'Co tuc MBB'),
  ('2026-05-12', 2936735, 'Co tuc HPG'),
  ('2026-06-01', 733281, 'Co tuc VND'),
  ('2026-07-10', 3335640, 'Co tuc MBB'),
  ('2026-07-30', 631750, 'Co tuc MWG')
) as v(ngay, amount, note)
where a.name = 'iDragon' and c.name = 'Co tuc' and c.user_id = a.user_id;

commit;

-- ================== KIEM LAI ==================
-- (a) So co tung ma. Phai ra: HPG 7158 | MBB 3696 | MWG 700 | VND 1625
select symbol, sum(case when kind = 'sell' then -quantity else quantity end) as so_co
from public.stock_trades t join public.accounts a on a.id = t.account_id
where a.name = 'iDragon' group by symbol order by symbol;

-- (b) Tien chua dau tu. Phai ra dung 60432999
select b.balance
       - coalesce((select sum(quantity * price + fee) from public.stock_trades t
                   where t.account_id = b.id and t.kind = 'buy'), 0)
       + coalesce((select sum(quantity * price - fee - tax) from public.stock_trades t
                   where t.account_id = b.id and t.kind = 'sell'), 0) as tien_chua_dau_tu
from public.account_balances b where b.name = 'iDragon';

-- (c) Dem cho chac (chay hai lan se thay so nhan doi)
select (select count(*) from public.stock_trades t join public.accounts a on a.id=t.account_id where a.name='iDragon') as so_lenh,
       (select count(*) from public.transactions x join public.accounts a on a.id=x.account_id or a.id=x.to_account_id where a.name='iDragon') as so_giao_dich;
