# Zerodha Kite Mobile — Design System

Exact replica of Zerodha Kite 3.0 mobile app design language.

## Colors
```
Primary blue:   #387ED1
Gain green:     #25B87E
Loss red:       #E64D3D
Warning orange: #F59E0B

App background: #FAFAFA
Card/surface:   #FFFFFF
Surface light:  #F8F9FA
Border:         #E8E8E8
Border light:   #F1F3F4

Text primary:   #1E1E1E
Text secondary: #738390
Text muted:     #B3BBBF

Buy button:     #25B87E (green)
Sell button:    #E64D3D (red)
CTA button:     #387ED1 (blue)
```

## Typography (Inter / -apple-system)
```
Display:   28px 700  — portfolio totals, big prices
Title:     17px 700  — screen headers
Subtitle:  15px 600  — section labels
Body:      14px 400  — stock names, labels
Price:     14px 600  — LTP prices
Caption:   12px 400  — exchange labels, meta info
Micro:     11px 400  — muted details
```

## Spacing scale: 4, 8, 12, 16, 20, 24

## Key Components

### Bottom Tab Bar
- Height: 58px (+ safe area bottom)
- Background: #FFFFFF
- Active: #387ED1 (icon + label)
- Inactive: #9CA3AF
- Border top: 1px #E8E8E8

### Index Ticker (top of every screen)
- Height: 44px
- Background: #FFFFFF
- Border bottom: 1px #E8E8E8
- Shows: NIFTY 50 + BANK NIFTY side by side
- Tap expands to show SENSEX, NIFTY IT, FINNIFTY
- Live badge: green dot + "LIVE" text
- Tappable → navigates to IndexChartScreen

### Stock Row (Watchlist / Markets)
- Height: 54px minimum
- Padding: 14px horizontal, 10px vertical
- Border bottom: 1px #F1F3F4
- Left: Symbol (14px 700 #1E1E1E) + Exchange badge (NSE/BSE, 10px, blue border pill)
- Right: LTP (14px 600) + Change % (11px, green/red)
- Far right: B and S buttons (28x28, radius 4, green B / red S)
- Long press → opens action sheet

### Action Sheet (long press on stock)
- Bottom sheet, white, radius 16 top
- Options: Buy, Sell, View chart, Create alert, Remove from watchlist
- Each option: 54px height, icon + label

### Card
- Background: #FFFFFF
- Border: 1px #E8E8E8
- Border radius: 8px
- No elevation/shadow (Kite is flat)

### Badge / Chip
- Exchange: "NSE" — border 1px #BFDBFE, text #387ED1, radius 4, padding 4x6
- Product type: flat text label
- Status: colored dot + text

### Section Header
- Uppercase, 11px 700 #738390, letter-spacing 0.5
- Padding: 12px horizontal, 8px top, 4px bottom

### Form Fields (Order Entry)
- Border: 1px #E8E8E8
- Radius: 6px
- Height: 48px
- Active border: #387ED1
- Label: 11px above field, #738390
- Value: 15px 600 #1E1E1E

### Segmented Control
- Background: #F1F3F4
- Active: #FFFFFF with shadow
- Radius: 8px
- Height: 36px
- Text: 13px 600

### Place Order Button
- Full-width, 52px height
- BUY: #25B87E background, white text
- SELL: #E64D3D background, white text
- Radius: 8px
- Text: 16px 700

## Screen Layouts

### Watchlist (Dashboard)
```
[Safe area top]
[Index Ticker — 44px]
[Watchlist tabs — 44px, horizontal scroll, + button]
[Stock count bar — 28px, "X/250"]
[FlatList of stock rows]
```

### Markets
```
[Index Ticker]
[Header "Markets"]
[Index cards — horizontal scroll, 4 index cards]
[Search bar]
[Category tabs — All / Gainers / Losers / 52W High / 52W Low]
[FlatList of stock rows]
```

### Portfolio
```
[Index Ticker]
[Holdings | Positions tabs]
[Summary bar — total invested / current / P&L]
[FlatList of holding/position rows]
```

### Orders
```
[Index Ticker]
[Open | GTT | Baskets | SIP tabs]
[Filter bar]
[FlatList of order rows]
```

### Order Entry (full screen)
```
[Header — back + symbol + exchange]
[BUY / SELL toggle — full width]
[Exchange: NSE | BSE toggle]
[Order type: Regular | Iceberg | Cover row]
[Product: CNC | MIS | NRML segments]
[Price mode: Market | Limit | SL | SL-M segments]
[Quantity field]
[Price field (disabled for Market)]
[Available margin row]
[Place Order button — full width, colored]
```

### Stock Detail
```
[Header — back + symbol + exchange + bookmark + alert]
[Price section — LTP big + change]
[Chart — full width, 280px height]
[Interval tabs — 1D 1W 1M 3M 1Y]
[OHLC card]
[Stats card]
[BUY / SELL footer]
```

### Funds
```
[Header — Funds + history icon]
[Available margin card — big number]
[Breakdown card — Used / Available / Total]
[Add Funds | Withdraw buttons]
```

### Account / Profile
```
[Already designed — see AccountScreen.js]
```
