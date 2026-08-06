'use strict';

// Centralized market-hours / order-validation rules — single source of truth
// shared by every route that used to duplicate isMarketOpen() inline.

// NSE/BSE equity trading holidays, sourced from Zerodha's published holiday
// calendar (zerodha.com/marketintel/holiday-calendar). Needs a yearly refresh.
const NSE_HOLIDAYS_2026 = [
    '2026-01-15', // Municipal Corporation Elections (Maharashtra)
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-26', // Shri Ram Navami
    '2026-03-31', // Shri Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-28', // Bakri Eid
    '2026-06-26', // Moharram
    '2026-09-14', // Ganesh Chaturthi
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-10', // Diwali-Balipratipada
    '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev
    '2026-12-25', // Christmas
];
const HOLIDAY_SET = new Set(NSE_HOLIDAYS_2026);

function istNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function istDateStr(d = istNow()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isHoliday(d = istNow()) {
    return HOLIDAY_SET.has(istDateStr(d));
}

// NSE market hours: Mon–Fri 09:15 IST start, excluding holidays. Since the
// Aug 3, 2026 SEBI/NSE Closing Auction Session (CAS) rollout, cash-equity
// close (09:15-15:30) and F&O/derivatives close (09:15-15:40, extended 10
// min to run alongside the new closing auction) diverge — pass segment
// 'FO' for options/futures routes, default 'EQ' for equity cash routes.
const MARKET_OPEN_MINS = 9 * 60 + 15; // 9:15 AM, unchanged for both segments
const EQ_CLOSE_MINS = 15 * 60 + 30; // 3:30 PM, cash-equity close (unchanged)
const FO_CLOSE_MINS = 15 * 60 + 40; // 3:40 PM, F&O close (was 15:30 before 2026-08-03)

function isMarketOpen(segment = 'EQ') {
    const ist = istNow();
    const day = ist.getDay();
    if (day === 0 || day === 6) return false;
    if (isHoliday(ist)) return false;
    const mins = ist.getHours() * 60 + ist.getMinutes();
    const close = segment === 'FO' ? FO_CLOSE_MINS : EQ_CLOSE_MINS;
    return mins >= MARKET_OPEN_MINS && mins <= close;
}

// True during the ~10 min BOD window (9:00-9:15) or EOD window (15:30-15:45)
// where a broker's RMS runs square-offs — used to gate the same-day MIS
// auto square-off job.
function isPastMisSquareOffTime() {
    const ist = istNow();
    const mins = ist.getHours() * 60 + ist.getMinutes();
    return mins >= 15 * 60 + 20; // 3:20 PM IST, matches real Zerodha RMS
}

const TICK_SIZE = 0.05; // standard NSE equity/options tick

function roundToTick(price) {
    return Math.round(price / TICK_SIZE) * TICK_SIZE;
}

function isValidTick(price) {
    // tolerate floating point noise
    return Math.abs(Math.round(price / TICK_SIZE) * TICK_SIZE - price) < 1e-6;
}

// NSE circuit filter — actual bands vary by stock category (2%/5%/10%/20%);
// without exchange-published per-scrip band data we apply the common 20%
// band used for most liquid/index-linked stocks. Approximation, documented.
const CIRCUIT_BAND = 0.20;

function isWithinCircuitBand(price, prevClose) {
    if (!prevClose || prevClose <= 0) return true;
    const upper = prevClose * (1 + CIRCUIT_BAND);
    const lower = prevClose * (1 - CIRCUIT_BAND);
    return price >= lower && price <= upper;
}

// MIS intraday leverage — real Kite/NSE margin varies per scrip (VaR+ELM
// based), typically 3x-5x for liquid stocks. We apply a flat approximation
// since the real per-scrip margin file isn't available to this app.
const MIS_LEVERAGE = 5;

// Approximate SPAN+exposure margin for writing (selling) an option, since
// real SPAN requires NSE's daily SPAN risk file. Common broker rule-of-thumb:
// ~12-15% of contract notional plus the premium itself.
const OPTION_WRITE_MARGIN_PCT = 0.15;

function approxOptionWriteMargin(underlyingPrice, quantity, premium) {
    return Math.round((underlyingPrice * quantity * OPTION_WRITE_MARGIN_PCT) + (premium * quantity));
}

module.exports = {
    isMarketOpen,
    isHoliday,
    isPastMisSquareOffTime,
    istNow,
    istDateStr,
    roundToTick,
    isValidTick,
    isWithinCircuitBand,
    TICK_SIZE,
    CIRCUIT_BAND,
    MIS_LEVERAGE,
    OPTION_WRITE_MARGIN_PCT,
    approxOptionWriteMargin,
    NSE_HOLIDAYS_2026,
    MARKET_OPEN_MINS,
    EQ_CLOSE_MINS,
    FO_CLOSE_MINS,
};
