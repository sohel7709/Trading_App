import math

# ======= Actual option chain config (from marketDataService.js) =======
OPTION_CONFIG = {
    'BANKNIFTY': {'strikeGap': 100, 'atmPremium': 280},
    'NIFTY':     {'strikeGap': 50,  'atmPremium': 120},
    'SENSEX':    {'strikeGap': 100, 'atmPremium': 350},
}

# ======= Index timeline (from seed file comments) =======
# Times are IST: HH:MM → index level
TIMELINE = {
    'NIFTY': {
        '09:15': 24168, '09:26': 24195, '09:47': 24268, '10:09': 24295,
        '10:31': 24158, '10:49': 24082, '11:14': 24028, '11:38': 23985,
        '12:07': 24038, '13:22': 24062, '14:11': 24020, '14:29': 24013,
    },
    'BANKNIFTY': {
        '09:15': 57964, '09:26': 58085, '09:47': 58247, '10:09': 58360,
        '10:32': 57965, '10:49': 57650, '11:14': 57420, '11:38': 57220,
        '12:07': 57480, '13:22': 57640, '14:11': 57678, '14:29': 57685,
    },
    'SENSEX': {
        '09:15': 77155, '09:26': 77200, '09:47': 77350, '10:09': 77480,
        '10:31': 77250, '10:49': 77100, '11:14': 76900, '11:38': 76790,
        '12:07': 76950, '13:22': 77080, '14:11': 77120, '14:29': 77155,
    },
}

def get_index_name(symbol):
    if symbol.startswith('BANKNIFTY'): return 'BANKNIFTY'
    if symbol.startswith('NIFTY'): return 'NIFTY'
    if symbol.startswith('SENSEX'): return 'SENSEX'
    return None

def extract_strike(symbol):
    """Extract strike price from symbol like BANKNIFTY30JUN57900CE → 57900"""
    import re
    m = re.search(r'(\d{4,5})(CE|PE)$', symbol)
    return int(m.group(1)) if m else None

def get_option_type(symbol):
    return 'CE' if symbol.endswith('CE') else 'PE'

def interpolate_index(time_str, timeline):
    """Get approximate index level at given time"""
    if time_str in timeline:
        return timeline[time_str]
    # Find closest
    times = sorted(timeline.keys())
    for t in times:
        if t >= time_str:
            return timeline[t]
    return timeline[times[-1]]

def hhmm(h, m):
    return f"{h:02d}:{m:02d}"

# ======= Seed trades data =======
# (symbol, buy_h, buy_m, buy_price, sell_h, sell_m, sell_price)
trades = [
    ('BANKNIFTY30JUN57900CE', 9, 15, 286.72,  10,  3, 313.51),
    ('NIFTY23JUN24100CE',     9, 16, 174.43,  11, 10, 187.76),
    ('SENSEX25JUN77500CE',    9, 17, 268.74,  12, 17, 298.15),
    ('BANKNIFTY30JUN57500PE', 9, 18, 294.38,  13, 24, 325.24),
    ('NIFTY23JUN23950PE',     9, 19, 157.62,  10, 31, 180.48),
    ('SENSEX25JUN77000PE',    9, 20, 279.64,  11, 38, 310.89),
    ('BANKNIFTY30JUN57300PE', 9, 21, 226.13,  12, 45, 248.86),
    ('NIFTY23JUN24000CE',     9, 22,  57.82,  13, 52,  63.62),
    ('BANKNIFTY30JUN57700CE', 9, 23, 362.74,  10, 59, 159.64),
    ('NIFTY23JUN24200CE',     9, 24, 243.75,  11,  6, 104.02),
    ('SENSEX25JUN77500CE',    9, 25, 274.89,  12, 13, 113.60),
    ('BANKNIFTY30JUN57600PE', 9, 26, 382.41,  13, 20, 161.36),
    ('NIFTY23JUN24050PE',     9, 15, 184.63,  10, 27,  78.39),
    ('SENSEX25JUN77200PE',    9, 16, 268.73,  11, 34, 108.73),
    ('BANKNIFTY30JUN58000CE', 9, 17, 198.45,  12, 42,  33.78),
    ('NIFTY23JUN24250CE',     9, 18, 224.86,  13, 48, 102.48),
    ('SENSEX25JUN78000CE',    9, 19, 276.34,  10, 55, 114.34),
    ('BANKNIFTY30JUN57400PE', 9, 20, 351.27,  12,  3, 168.31),
    ('NIFTY23JUN23900PE',     9, 22, 172.38,  12,  9,  56.27),
]

print("=" * 85)
print("TRADE VERIFICATION: Strike Gaps, Option Pricing, & Buy/Sell Values")
print("=" * 85)

issues = 0
for sym, bh, bm, bp, sh, sm, sp in trades:
    idx = get_index_name(sym)
    cfg = OPTION_CONFIG[idx]
    strike = extract_strike(sym)
    opt_type = get_option_type(sym)
    
    # 1. Strike gap check
    gap_ok = strike % cfg['strikeGap'] == 0
    
    # 2. Get index levels at buy and sell times
    buy_time = hhmm(bh, bm)
    sell_time = hhmm(sh, sm)
    idx_buy = interpolate_index(buy_time, TIMELINE[idx])
    idx_sell = interpolate_index(sell_time, TIMELINE[idx])
    
    # 3. Expected price using marketDataService.js formula
    def calc_price(index_price, strike, opt_type, atm_premium, gap):
        intrinsic = max(0, index_price - strike) if opt_type == 'CE' else max(0, strike - index_price)
        steps = abs(strike - index_price) / gap
        decay = math.exp(-steps * 0.25)
        time_val = max(0.5, atm_premium * decay)
        # No noise for comparison
        return round(intrinsic + time_val, 2)
    
    expected_buy = calc_price(idx_buy, strike, opt_type, cfg['atmPremium'], cfg['strikeGap'])
    expected_sell = calc_price(idx_sell, strike, opt_type, cfg['atmPremium'], cfg['strikeGap'])
    
    buy_diff_pct = abs(bp - expected_buy) / expected_buy * 100 if expected_buy > 0 else 999
    sell_diff_pct = abs(sp - expected_sell) / expected_sell * 100 if expected_sell > 0 else 999
    
    # 4. Quantity and buy value
    # Extract lots from the pattern (approximate from P&L)
    # Buy value = qty * buyPrice
    # For verification, compute approximate buy value range
    
    # Flag issues
    buy_ok = buy_diff_pct < 50  # Within 50% of model (model is noisy approximation)
    sell_ok = sell_diff_pct < 50
    
    flag = ""
    if not gap_ok:
        flag += " [BAD GAP]"
        issues += 1
    if not buy_ok:
        flag += f" [BUY off {buy_diff_pct:.0f}%]"
        issues += 1
    if not sell_ok:
        flag += f" [SELL off {sell_diff_pct:.0f}%]"
        issues += 1

    print(f"\n{sym}  strike={strike} {'CE' if opt_type=='CE' else 'PE'}")
    print(f"  Buy  @ {buy_time}: idx={idx_buy}  |  Price: seed={bp}  model={expected_buy}  (diff {buy_diff_pct:.1f}%)")
    print(f"  Sell @ {sell_time}: idx={idx_sell}  |  Price: seed={sp}  model={expected_sell}  (diff {sell_diff_pct:.1f}%)")
    print(f"  Strike gap: {cfg['strikeGap']} → {'✓' if gap_ok else '✗'}{flag}")

print(f"\n{'='*85}")
print(f"Total issues: {issues}")
if issues == 0:
    print("✓ All strikes valid. Prices within realistic range.")