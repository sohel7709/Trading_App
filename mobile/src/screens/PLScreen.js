import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, ActivityIndicator, FlatList, Platform,
  StatusBar, Alert, Share, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import XLSX from 'xlsx';
import { colors } from '../theme/colors';
import { api } from '../api/client';

const KITE_LOGO = require('../../assets/Icon.png');

/* ══════════════════════════════════════════
   CONSTANTS & HELPERS
══════════════════════════════════════════ */
const SEGMENTS = [
  { key: 'combined',    label: 'Combined'          },
  { key: 'equity',      label: 'Equity'            },
  { key: 'fno',         label: 'Futures & Options' },
  { key: 'currency',    label: 'Currency'          },
  { key: 'commodity',   label: 'Commodity'         },
  { key: 'mutualfunds', label: 'Mutual Funds'      },
  { key: 'mtf',         label: 'MTF'               },
];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const today = () => new Date().toISOString().slice(0, 10);
const oneWeekAgo = () => {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const formatAmt = (v) => {
  if (v === 0 || v === null || v === undefined) return '0';
  const abs = Math.abs(v);
  if (abs >= 100000) return `${(v / 100000).toFixed(2)}L`;
  if (abs >= 1000)   return `${(v / 1000).toFixed(2)}K`;
  return v.toFixed(2);
};

/* ══════════════════════════════════════════
   MINI CALENDAR (React Native)
══════════════════════════════════════════ */
function MiniCalendar({ selectedDate, onSelect, maxDate }) {
  const initial = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const [viewYear,  setViewYear]  = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [showYearPicker, setShowYearPicker] = useState(false);

  const years = [];
  for (let y = 2015; y <= new Date().getFullYear(); y++) years.push(y);

  const firstDay   = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth= new Date(viewYear, viewMonth + 1, 0).getDate();
  const offset     = firstDay === 0 ? 6 : firstDay - 1; // Mon-first

  const isoForDay = (d) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <View>
      {/* Nav */}
      <View style={calS.nav}>
        <TouchableOpacity onPress={prevMonth} style={calS.navBtn}>
          <Text style={calS.navArrow}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowYearPicker(p => !p)} style={calS.monthYearBtn}>
          <Text style={calS.monthYearText}>
            {MONTHS[viewMonth]}  {viewYear} ▾
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={nextMonth} style={calS.navBtn}>
          <Text style={calS.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Year picker dropdown */}
      {showYearPicker && (
        <ScrollView style={calS.yearScroll} nestedScrollEnabled>
          {years.map(y => (
            <TouchableOpacity key={y}
              onPress={() => { setViewYear(y); setShowYearPicker(false); }}
              style={[calS.yearRow, y === viewYear && calS.yearRowActive]}>
              <Text style={[calS.yearText, y === viewYear && calS.yearTextActive]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!showYearPicker && (
        <>
          {/* Day labels */}
          <View style={calS.grid}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <Text key={d} style={calS.dayLabel}>{d}</Text>
            ))}

            {/* Blanks */}
            {Array.from({ length: offset }).map((_, i) => (
              <View key={`b${i}`} style={calS.dayCell} />
            ))}

            {/* Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d   = i + 1;
              const iso = isoForDay(d);
              const isSelected = iso === selectedDate;
              const isDisabled = maxDate && iso > maxDate;
              const isTodayCell= iso === today();

              return (
                <TouchableOpacity key={d}
                  disabled={isDisabled}
                  onPress={() => onSelect(iso)}
                  style={[calS.dayCell, isSelected && calS.dayCellSelected]}>
                  <Text style={[
                    calS.dayText,
                    isSelected   && calS.dayTextSelected,
                    isTodayCell  && !isSelected && calS.dayTextToday,
                    isDisabled   && calS.dayTextDisabled,
                  ]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const calS = StyleSheet.create({
  nav: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:8, marginBottom:8 },
  navBtn: { padding:8 },
  navArrow: { fontSize:22, color:'#555', fontWeight:'600' },
  monthYearBtn: { flex:1, alignItems:'center' },
  monthYearText: { fontSize:16, fontWeight:'700', color:'#222' },
  yearScroll: { maxHeight:180, borderWidth:1, borderColor:'#e0e0e0', borderRadius:10, marginHorizontal:8, marginBottom:8 },
  yearRow: { paddingVertical:10, paddingHorizontal:16 },
  yearRowActive: { backgroundColor:'#1b5fe4' },
  yearText: { fontSize:14, color:'#333' },
  yearTextActive: { color:'#fff', fontWeight:'700' },
  grid: { flexDirection:'row', flexWrap:'wrap' },
  dayLabel: { width:'14.28%', textAlign:'center', fontSize:11, color:'#aaa', fontWeight:'600', paddingBottom:6 },
  dayCell: { width:'14.28%', alignItems:'center', paddingVertical:8 },
  dayCellSelected: { backgroundColor:'#1b5fe4', borderRadius:8 },
  dayText: { fontSize:13, color:'#333' },
  dayTextSelected: { color:'#fff', fontWeight:'700' },
  dayTextToday: { color:'#1b5fe4', fontWeight:'700' },
  dayTextDisabled: { color:'#ccc' },
});

/* ══════════════════════════════════════════
   DATE PICKER BOTTOM SHEET
══════════════════════════════════════════ */
function DatePickerSheet({ visible, fromDate, toDate, onApply, onClose }) {
  const [localFrom, setLocalFrom] = useState(fromDate);
  const [localTo,   setLocalTo]   = useState(toDate);
  const [activeField, setActiveField] = useState('from');

  const handleCalSelect = (iso) => {
    if (activeField === 'from') {
      setLocalFrom(iso);
      if (iso > localTo) setLocalTo(iso);
      setActiveField('to');
    } else {
      if (iso < localFrom) { setLocalFrom(iso); setLocalTo(localFrom); }
      else setLocalTo(iso);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={dpS.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={dpS.sheet}>
        {/* From/To inputs */}
        <View style={dpS.inputRow}>
          <TouchableOpacity
            style={[dpS.inputBox, activeField === 'from' && dpS.inputBoxActive]}
            onPress={() => setActiveField('from')}>
            <Text style={dpS.inputLabel}>From</Text>
            <Text style={dpS.inputVal}>{localFrom}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[dpS.inputBox, activeField === 'to' && dpS.inputBoxActive]}
            onPress={() => setActiveField('to')}>
            <Text style={dpS.inputLabel}>To</Text>
            <Text style={dpS.inputVal}>{localTo}</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={dpS.calWrap}>
          <MiniCalendar
            selectedDate={activeField === 'from' ? localFrom : localTo}
            onSelect={handleCalSelect}
            maxDate={today()}
          />
        </View>

        {/* Buttons */}
        <View style={dpS.btnRow}>
          <TouchableOpacity style={dpS.cancelBtn} onPress={onClose}>
            <Text style={dpS.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={dpS.applyBtn} onPress={() => onApply(localFrom, localTo)}>
            <Text style={dpS.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dpS = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.25)' },
  sheet: {
    position:'absolute', bottom:0, left:0, right:0,
    backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight:'85%',
  },
  inputRow: { flexDirection:'row', gap:12, padding:20, paddingBottom:12 },
  inputBox: {
    flex:1, borderWidth:1.5, borderColor:'#e0e0e0',
    borderRadius:10, padding:12,
  },
  inputBoxActive: { borderColor:'#1b5fe4' },
  inputLabel: { fontSize:11, color:'#aaa', marginBottom:4, fontWeight:'600' },
  inputVal: { fontSize:14, color:'#222', fontWeight:'500' },
  calWrap: { paddingHorizontal:16, paddingVertical:8 },
  btnRow: {
    flexDirection:'row', justifyContent:'space-between',
    paddingHorizontal:20, paddingTop:12,
    borderTopWidth:1, borderTopColor:'#f0f0f0',
    gap:12,
  },
  cancelBtn: { paddingHorizontal:20, paddingVertical:12 },
  cancelText: { color:'#1b5fe4', fontSize:16, fontWeight:'600' },
  applyBtn: {
    flex:1, backgroundColor:'#1b5fe4', borderRadius:10,
    paddingVertical:13, alignItems:'center',
  },
  applyText: { color:'#fff', fontSize:16, fontWeight:'700' },
});

/* ══════════════════════════════════════════
   FILTER DRAWER MODAL
══════════════════════════════════════════ */
function FilterDrawer({ visible, segment, onSegmentChange, onReset, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fdS.container}>
        <View style={fdS.drawer}>
          {/* Header */}
          <View style={fdS.header}>
            <TouchableOpacity onPress={onClose} style={fdS.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#333" />
            </TouchableOpacity>
            <Text style={fdS.headerTitle}>Search and filter</Text>
          </View>

          <ScrollView>
            {/* Segment card */}
            <View style={fdS.card}>
              <Text style={fdS.cardTitle}>Select segment</Text>
              {SEGMENTS.map((seg, i) => (
                <View key={seg.key}>
                  {i > 0 && <View style={fdS.separator} />}
                  <TouchableOpacity style={fdS.row} onPress={() => onSegmentChange(seg.key)}>
                    <Text style={fdS.rowLabel}>{seg.label}</Text>
                    <View style={[fdS.radio, segment === seg.key && fdS.radioActive]}>
                      {segment === seg.key && <View style={fdS.radioDot} />}
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Reset */}
            <TouchableOpacity style={fdS.resetBtn} onPress={onReset}>
              <Text style={fdS.resetText}>Reset</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const fdS = StyleSheet.create({
  container: { flex:1, backgroundColor:'rgba(0,0,0,0.3)' },
  drawer: {
    flex:1, backgroundColor:'#f2f2f2',
    width:'90%', maxWidth:400,
  },
  header: {
    flexDirection:'row', alignItems:'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingHorizontal:16, paddingBottom:16,
    backgroundColor:'#f2f2f2',
    gap:12,
  },
  backBtn: { padding:4 },
  headerTitle: { fontSize:18, fontWeight:'500', color:'#222' },
  card: {
    backgroundColor:'#23253a', borderRadius:16,
    marginHorizontal:16, marginTop:8,
  },
  cardTitle: { color:'#7b7e99', fontSize:15, padding:18, paddingBottom:10 },
  separator: { height:1, backgroundColor:'rgba(255,255,255,0.08)', marginHorizontal:16 },
  row: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:20, paddingVertical:16,
  },
  rowLabel: { color:'#fff', fontSize:16 },
  radio: {
    width:22, height:22, borderRadius:11,
    borderWidth:2, borderColor:'#555',
    alignItems:'center', justifyContent:'center',
  },
  radioActive: { borderColor:'#1b5fe4' },
  radioDot: { width:12, height:12, borderRadius:6, backgroundColor:'#1b5fe4' },
  resetBtn: { alignSelf:'center', marginTop:20, paddingVertical:10, paddingHorizontal:24 },
  resetText: { color:'#1b5fe4', fontSize:16, fontWeight:'600' },
});

/* ══════════════════════════════════════════
   CHARGES BREAKDOWN MODAL
══════════════════════════════════════════ */
function ChargesModal({ visible, fromDate, toDate, segment, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.getPnlCharges(fromDate, toDate, segment)
      .then(r => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [visible, fromDate, toDate, segment]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={chS.overlay} activeOpacity={1} onPress={onClose} />
      <View style={chS.card}>
        <View style={chS.header}>
          <Text style={chS.title}>Charges breakdown</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color="#888" />
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color="#1b5fe4" style={{ marginVertical:24 }} />
        ) : data ? (
          <>
            {data.breakdown.map(b => (
              <View key={b.label} style={chS.row}>
                <Text style={chS.rowLabel}>{b.label}</Text>
                <Text style={chS.rowVal}>₹{b.amount.toFixed(2)}</Text>
              </View>
            ))}
            <View style={[chS.row, { borderTopWidth:1, borderTopColor:'#f0f0f0', marginTop:8, paddingTop:12 }]}>
              <Text style={[chS.rowLabel, { fontWeight:'700', color:'#222' }]}>Total charges</Text>
              <Text style={[chS.rowVal, { fontWeight:'700', color:'#222' }]}>₹{data.total.toFixed(2)}</Text>
            </View>
          </>
        ) : (
          <Text style={{ color:'#aaa', textAlign:'center', padding:24 }}>No data available</Text>
        )}
      </View>
    </Modal>
  );
}

const chS = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.35)' },
  card: {
    position:'absolute',
    top:'50%', left:'5%', right:'5%',
    transform:[{ translateY:-180 }],
    backgroundColor:'#fff', borderRadius:16,
    padding:20, elevation:10,
    shadowColor:'#000', shadowOffset:{ width:0, height:4 },
    shadowOpacity:0.2, shadowRadius:16,
  },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  title: { fontSize:17, fontWeight:'700', color:'#222' },
  row: { flexDirection:'row', justifyContent:'space-between', paddingVertical:9, borderBottomWidth:1, borderBottomColor:'#f5f5f5' },
  rowLabel: { color:'#666', fontSize:14 },
  rowVal: { color:'#333', fontSize:14, fontWeight:'500' },
});

/* ══════════════════════════════════════════
   TRADE CARD (collapsible)
══════════════════════════════════════════ */
function TradeCard({ trade }) {
  const [expanded, setExpanded] = useState(false);
  const plColor = trade.realizedPL >= 0 ? '#00b386' : '#eb5b3c';

  return (
    <TouchableOpacity style={tC.card} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
      <View style={tC.top}>
        <Text style={tC.symbol}>{trade.stockSymbol}</Text>
        <Text style={tC.qty}>Qty. {trade.quantity}</Text>
      </View>
      <View style={tC.plRow}>
        <Text style={tC.plLabel}>Realised</Text>
        <Text style={[tC.plVal, { color: plColor }]}>
          {trade.realizedPL >= 0 ? '+' : ''}{trade.realizedPL.toFixed(2)}{' '}
          <Text style={tC.plPct}>({trade.realizedPct >= 0 ? '+' : ''}{trade.realizedPct}%)</Text>
        </Text>
      </View>

      {expanded && (
        <View style={tC.detail}>
          <View style={tC.detailRow}>
            <View style={tC.detailCell}>
              <Text style={tC.detailLabel}>Buy avg.</Text>
              <Text style={tC.detailVal}>{trade.buyAvg.toFixed(2)}</Text>
            </View>
            <View style={tC.detailCell}>
              <Text style={tC.detailLabel}>Buy value</Text>
              <Text style={tC.detailVal}>{trade.buyValue.toFixed(2)}</Text>
            </View>
          </View>
          <View style={tC.detailRow}>
            <View style={tC.detailCell}>
              <Text style={tC.detailLabel}>Sell avg.</Text>
              <Text style={tC.detailVal}>{trade.sellAvg.toFixed(2)}</Text>
            </View>
            <View style={tC.detailCell}>
              <Text style={tC.detailLabel}>Sell value</Text>
              <Text style={tC.detailVal}>{trade.sellValue.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={tC.expandIcon}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14} color="#bbb"
        />
      </View>
    </TouchableOpacity>
  );
}

const tC = StyleSheet.create({
  card: {
    backgroundColor:'#fff', borderRadius:12, padding:16,
    marginBottom:10, elevation:1,
    shadowColor:'#000', shadowOffset:{ width:0,height:1 },
    shadowOpacity:0.05, shadowRadius:4,
    borderWidth:1, borderColor:'#f0f0f0',
  },
  top: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  symbol: { fontWeight:'700', fontSize:14, color:'#222' },
  qty: { fontSize:12, color:'#888' },
  plRow: { flexDirection:'row', alignItems:'center' },
  plLabel: { fontSize:13, color:'#888', marginRight:8 },
  plVal: { fontSize:14, fontWeight:'700' },
  plPct: { fontSize:12, fontWeight:'400' },
  detail: { marginTop:12, paddingTop:12, borderTopWidth:1, borderTopColor:'#f0f0f0' },
  detailRow: { flexDirection:'row', marginBottom:8 },
  detailCell: { flex:1 },
  detailLabel: { fontSize:11, color:'#aaa', marginBottom:2 },
  detailVal: { fontSize:13, color:'#333', fontWeight:'500' },
  expandIcon: { alignItems:'flex-end', marginTop:4 },
});

/* ══════════════════════════════════════════
   ROBOT ILLUSTRATION (empty state)
══════════════════════════════════════════ */
function RobotEmoji() {
  return (
    <View style={robS.wrap}>
      <View style={robS.circle}>
        <View style={robS.body}>
          <View style={robS.eyeRow}>
            <View style={robS.eye}><View style={robS.pupil}/></View>
            <View style={robS.eye}><View style={robS.pupil}/></View>
          </View>
          <View style={robS.mouth}/>
        </View>
        <View style={robS.belt}/>
      </View>
    </View>
  );
}

const robS = StyleSheet.create({
  wrap: { alignItems:'center', marginBottom:16 },
  circle: {
    width:130, height:130, borderRadius:65,
    backgroundColor:'#1b5fe4', justifyContent:'flex-end',
    alignItems:'center', overflow:'hidden',
  },
  body: {
    width:80, height:56, backgroundColor:'#FFD600',
    borderRadius:10, alignItems:'center', justifyContent:'center',
    marginBottom:8,
  },
  eyeRow: { flexDirection:'row', gap:14, marginBottom:8 },
  eye: {
    width:18, height:14, backgroundColor:'#fff',
    borderRadius:4, alignItems:'center', justifyContent:'center',
  },
  pupil: { width:8, height:8, backgroundColor:'#1b5fe4', borderRadius:4 },
  mouth: { width:36, height:8, backgroundColor:'#fff', borderRadius:4 },
  belt: { width:80, height:16, backgroundColor:'#FFD600', marginBottom:0 },
});

/* ══════════════════════════════════════════
   MONTHLY BREAKDOWN COMPONENT
══════════════════════════════════════════ */
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MonthlyBreakdownView({ months, totals, initialBalance }) {
  if (!months || months.length === 0) {
    return (
      <View style={mbS.empty}>
        <Text style={mbS.emptyText}>No monthly data for the selected period.</Text>
      </View>
    );
  }

  const overallReturn = initialBalance > 0
    ? ((totals.totalNetPL / initialBalance) * 100).toFixed(2)
    : '0.00';

  return (
    <ScrollView contentContainerStyle={mbS.container} showsVerticalScrollIndicator={false}>
      {/* Top summary strip */}
      <View style={mbS.strip}>
        {[
          ['Net P&L', totals.totalNetPL, true],
          ['Charges', totals.totalCharges, false],
          ['Gross P&L', totals.totalRealizedPL, true],
        ].map(([label, val, colored]) => (
          <View key={label} style={mbS.stripCell}>
            <Text style={mbS.stripLabel}>{label}</Text>
            <Text style={[mbS.stripVal, colored && { color: parseFloat(val) >= 0 ? '#00b386' : '#eb5b3c' }]}>
              {colored && parseFloat(val) >= 0 ? '+' : ''}₹{formatAmt(Math.abs(val))}
            </Text>
          </View>
        ))}
      </View>

      <View style={mbS.strip}>
        {[
          ['Total Trades', totals.totalTrades, null],
          ['Overall Return', `${parseFloat(overallReturn) >= 0 ? '+' : ''}${overallReturn}%`, parseFloat(overallReturn) >= 0 ? '#00b386' : '#eb5b3c'],
          ['Turnover', `₹${formatAmt(totals.totalTurnover)}`, null],
        ].map(([label, val, color]) => (
          <View key={label} style={mbS.stripCell}>
            <Text style={mbS.stripLabel}>{label}</Text>
            <Text style={[mbS.stripVal, color ? { color } : {}]}>{val}</Text>
          </View>
        ))}
      </View>

      {/* Month cards */}
      {months.map((m) => {
        const [y, mo] = m.month.split('-');
        const monthLabel = `${MONTH_SHORT[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
        const isProfit = m.netPL >= 0;
        const winPct = m.tradeCount > 0 ? Math.round((m.winTrades / m.tradeCount) * 100) : 0;

        return (
          <View key={m.month} style={mbS.card}>
            {/* Card header */}
            <View style={[mbS.cardHeader, { borderLeftColor: isProfit ? '#00b386' : '#eb5b3c' }]}>
              <View>
                <Text style={mbS.cardMonth}>{monthLabel}</Text>
                <Text style={mbS.cardMeta}>
                  {m.tradeCount} trades · {winPct}% win rate
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[mbS.cardNetPL, { color: isProfit ? '#00b386' : '#eb5b3c' }]}>
                  {isProfit ? '+' : ''}₹{formatAmt(Math.abs(m.netPL))}
                </Text>
                <Text style={mbS.cardNetLabel}>Net P&L</Text>
              </View>
            </View>

            {/* Detail grid */}
            <View style={mbS.grid}>
              {[
                ['Opening Balance', `₹${formatAmt(m.openingBalance)}`, '#333'],
                ['Closing Balance', `₹${formatAmt(m.closingBalance)}`, '#333'],
                ['Gross P&L', `${m.realizedPL >= 0 ? '+' : ''}₹${formatAmt(Math.abs(m.realizedPL))}`, m.realizedPL >= 0 ? '#00b386' : '#eb5b3c'],
                ['Charges', `₹${formatAmt(m.charges)}`, '#333'],
                ['Turnover', `₹${formatAmt(m.turnover)}`, '#333'],
                ['W / L Trades', `${m.winTrades} / ${m.lossTrades}`, '#333'],
              ].map(([label, val, color]) => (
                <View key={label} style={mbS.gridCell}>
                  <Text style={mbS.gridLabel}>{label}</Text>
                  <Text style={[mbS.gridVal, { color }]}>{val}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {/* Totals footer */}
      <View style={mbS.footer}>
        {[
          ['Total Net P&L', totals.totalNetPL, true],
          ['Total Charges', totals.totalCharges, false],
          ['Total Gross P&L', totals.totalRealizedPL, true],
        ].map(([label, val, colored]) => (
          <View key={label} style={mbS.footerCell}>
            <Text style={mbS.footerLabel}>{label}</Text>
            <Text style={[mbS.footerVal, colored ? { color: parseFloat(val) >= 0 ? '#00b386' : '#eb5b3c' } : { color: '#fff' }]}>
              {colored && parseFloat(val) >= 0 ? '+' : ''}₹{formatAmt(Math.abs(val))}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const mbS = StyleSheet.create({
  container: { padding: 16, paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#aaa', fontSize: 14, textAlign: 'center' },

  strip: {
    flexDirection: 'row', backgroundColor: '#f9f9f9',
    borderRadius: 10, marginBottom: 8, overflow: 'hidden',
  },
  stripCell: { flex: 1, padding: 12, alignItems: 'center' },
  stripLabel: { fontSize: 10, color: '#999', marginBottom: 3 },
  stripVal: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
    overflow: 'hidden', borderWidth: 1, borderColor: '#f0f0f0',
    elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderLeftWidth: 3,
  },
  cardMonth: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  cardMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
  cardNetPL: { fontSize: 16, fontWeight: '700' },
  cardNetLabel: { fontSize: 10, color: '#aaa', marginTop: 1 },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  gridCell: {
    width: '50%', padding: 12,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  gridLabel: { fontSize: 10, color: '#aaa', marginBottom: 3 },
  gridVal: { fontSize: 13, fontWeight: '600' },

  footer: {
    flexDirection: 'row', backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 4, marginTop: 4,
  },
  footerCell: { flex: 1, padding: 12, alignItems: 'center' },
  footerLabel: { fontSize: 10, color: '#888', marginBottom: 4 },
  footerVal: { fontSize: 13, fontWeight: '700' },
});

/* ══════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════ */
export default function PLScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [fromDate, setFromDate] = useState(oneWeekAgo());
  const [toDate,   setToDate]   = useState(today());
  const [segment,  setSegment]  = useState('combined');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFilter,     setShowFilter]     = useState(false);
  const [showCharges,    setShowCharges]    = useState(false);
  const [hasLoaded,      setHasLoaded]      = useState(false);

  const [loading, setLoading] = useState(false);
  const [pnlData, setPnlData] = useState(null);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);
  const PAGE_SIZE = 20;

  const [view,             setView]             = useState('trades'); // 'trades' | 'monthly'
  const [monthlyData,      setMonthlyData]      = useState(null);
  const [monthlyLoading,   setMonthlyLoading]   = useState(false);

  /* fetch */
  const fetchPnl = useCallback(async (seg, from, to) => {
    setLoading(true); setError(null);
    try {
      const data = await api.getPnl(seg, from, to);
      setPnlData(data);
      setHasLoaded(true);
      setPage(1);
    } catch (e) {
      setError(e?.message || 'Failed to fetch P&L data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMonthlyBreakdown = useCallback(async (seg, from, to) => {
    setMonthlyLoading(true);
    try {
      const data = await api.getMonthlyBreakdown(seg, from, to);
      setMonthlyData(data);
    } catch {
      setMonthlyData(null);
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  // Auto-load on mount with last 90 days
  useEffect(() => {
    const from = new Date(); from.setDate(from.getDate() - 90);
    const fromStr = from.toISOString().slice(0, 10);
    setFromDate(fromStr);
    fetchPnl('combined', fromStr, today());
    fetchMonthlyBreakdown('combined', fromStr, today());
  }, []);

  const handleApplyDate = (from, to) => {
    setFromDate(from); setToDate(to); setShowDatePicker(false);
  };

  const handleGenerate = () => {
    fetchPnl(segment, fromDate, toDate);
    fetchMonthlyBreakdown(segment, fromDate, toDate);
  };
  const handleResetFilter = () => setSegment('combined');

  /* ── Download format picker ── */
  const [showDownloadPicker, setShowDownloadPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  const openDownload = () => {
    if (!(pnlData?.trades?.length)) return Alert.alert('No data', 'Generate a report first');
    setShowDownloadPicker(true);
  };

  /* shared helpers */
  const tradeRows = (trades) => trades.map((t, i) => ({
    '#': i + 1,
    'Symbol': t.stockSymbol,
    'Date': t.tradeDate ? new Date(t.tradeDate).toLocaleDateString('en-IN') : '',
    'Buy Qty': t.buyQty ?? t.quantity,
    'Sell Qty': t.sellQty ?? t.quantity,
    'Buy Avg (₹)': Number((t.buyAvg ?? 0).toFixed(2)),
    'Sell Avg (₹)': Number((t.sellAvg ?? 0).toFixed(2)),
    'Buy Value (₹)': Number((t.buyValue ?? 0).toFixed(2)),
    'Sell Value (₹)': Number((t.sellValue ?? 0).toFixed(2)),
    'Realised P&L (₹)': Number((t.realizedPL ?? 0).toFixed(2)),
    'P&L %': `${(t.realizedPct ?? 0) >= 0 ? '+' : ''}${t.realizedPct ?? 0}%`,
    'Charges (₹)': Number((t.charges ?? 0).toFixed(2)),
    'Net P&L (₹)': Number((t.netPL ?? 0).toFixed(2)),
  }));

  const shareFile = async (uri, mime, uti) => {
    const ok = await Sharing.isAvailableAsync();
    if (ok) await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: 'Save Report', UTI: uti });
    else Alert.alert('Sharing unavailable', 'Cannot open share sheet on this device.');
  };

  /* ── Excel ── */
  const downloadExcel = async () => {
    const trades = pnlData?.trades || [];
    const s = pnlData?.summary;
    const wb = XLSX.utils.book_new();

    const wsT = XLSX.utils.json_to_sheet(tradeRows(trades));
    wsT['!cols'] = [{wch:4},{wch:22},{wch:12},{wch:8},{wch:8},{wch:12},{wch:12},{wch:14},{wch:14},{wch:16},{wch:8},{wch:12},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsT, 'Trades');

    const wsS = XLSX.utils.aoa_to_sheet([
      ['P&L Summary', `${fromDate} to ${toDate}`], [],
      ['Metric', 'Value (₹)'],
      ['Realised P&L',    Number((s?.realizedPL      ?? 0).toFixed(2))],
      ['Unrealised P&L',  Number((s?.unrealizedPL    ?? 0).toFixed(2))],
      ['Charges & Taxes', Number((s?.chargesAndTaxes ?? 0).toFixed(2))],
      ['Net Realised P&L',Number((s?.netRealizedPL   ?? 0).toFixed(2))],
      [], ['Winning Trades', s?.winningTrades ?? 0],
      ['Losing Trades', s?.losingTrades ?? 0],
      ['Total Trades', trades.length],
    ]);
    wsS['!cols'] = [{wch:20},{wch:16}];
    XLSX.utils.book_append_sheet(wb, wsS, 'Summary');

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const name = `PnL_${segLabel.replace(/\s+/g,'_')}_${fromDate}_${toDate}.xlsx`;
    const file = new FileSystem.File(FileSystem.Paths.join(FileSystem.Paths.cache, name));
    await file.write(base64, { encoding: 'base64' });
    await shareFile(file.uri, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'com.microsoft.excel.xlsx');
  };

  /* ── CSV ── */
  const downloadCSV = async () => {
    const trades = pnlData?.trades || [];
    const s = pnlData?.summary;
    const cols = ['#','Symbol','Date','Buy Qty','Sell Qty','Buy Avg (₹)','Sell Avg (₹)','Buy Value (₹)','Sell Value (₹)','Realised P&L (₹)','P&L %','Charges (₹)','Net P&L (₹)'];
    const rows = tradeRows(trades).map(r => cols.map(c => `"${r[c] ?? ''}"`).join(','));
    const csv = [
      `P&L Report: ${fromDate} to ${toDate},Segment: ${segLabel}`,
      '',
      cols.join(','),
      ...rows,
      '',
      'Summary',
      `Realised P&L,${(s?.realizedPL ?? 0).toFixed(2)}`,
      `Unrealised P&L,${(s?.unrealizedPL ?? 0).toFixed(2)}`,
      `Charges & Taxes,${(s?.chargesAndTaxes ?? 0).toFixed(2)}`,
      `Net Realised P&L,${(s?.netRealizedPL ?? 0).toFixed(2)}`,
      `Winning Trades,${s?.winningTrades ?? 0}`,
      `Losing Trades,${s?.losingTrades ?? 0}`,
      `Total Trades,${trades.length}`,
    ].join('\n');
    const name = `PnL_${segLabel.replace(/\s+/g,'_')}_${fromDate}_${toDate}.csv`;
    const file = new FileSystem.File(FileSystem.Paths.join(FileSystem.Paths.cache, name));
    await file.write(csv, { encoding: 'utf8' });
    await shareFile(file.uri, 'text/csv', 'public.comma-separated-values-text');
  };

  /* ── PDF ── */
  const downloadPDF = async () => {
    const trades = pnlData?.trades || [];
    const s = pnlData?.summary;
    const netColor = (s?.netRealizedPL ?? 0) >= 0 ? '#00b386' : '#eb5b3c';
    const trRows = trades.map((t, i) => {
      const plColor = (t.realizedPL ?? 0) >= 0 ? '#00b386' : '#eb5b3c';
      return `<tr style="background:${i%2===0?'#fff':'#f9fafb'}">
        <td>${i+1}</td><td><b>${t.stockSymbol}</b></td>
        <td>${t.tradeDate ? new Date(t.tradeDate).toLocaleDateString('en-IN') : ''}</td>
        <td>${t.buyQty ?? t.quantity}</td><td>${t.sellQty ?? t.quantity}</td>
        <td>₹${(t.buyAvg??0).toFixed(2)}</td><td>₹${(t.sellAvg??0).toFixed(2)}</td>
        <td>₹${(t.buyValue??0).toFixed(2)}</td><td>₹${(t.sellValue??0).toFixed(2)}</td>
        <td style="color:${plColor};font-weight:600">${(t.realizedPL??0)>=0?'+':''}₹${(t.realizedPL??0).toFixed(2)}</td>
        <td style="color:${plColor}">${(t.realizedPct??0)>=0?'+':''}${t.realizedPct??0}%</td>
        <td>₹${(t.charges??0).toFixed(2)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a;font-size:11px}
      h1{color:#387ed1;font-size:18px;margin:0 0 4px}
      .meta{color:#666;font-size:11px;margin-bottom:20px}
      .summary{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
      .card{background:#f5f7ff;border-radius:8px;padding:12px 18px;min-width:130px}
      .card-label{font-size:10px;color:#888;margin-bottom:4px}
      .card-val{font-size:15px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#387ed1;color:#fff;padding:7px 6px;text-align:left;white-space:nowrap}
      td{padding:6px;border-bottom:1px solid #eee;white-space:nowrap}
      .footer{margin-top:20px;font-size:9px;color:#aaa;text-align:center}
    </style></head><body>
    <h1>P&amp;L Report</h1>
    <div class="meta">${fromDate} &nbsp;→&nbsp; ${toDate} &nbsp;|&nbsp; Segment: ${segLabel}</div>
    <div class="summary">
      <div class="card"><div class="card-label">Realised P&amp;L</div>
        <div class="card-val" style="color:${(s?.realizedPL??0)>=0?'#00b386':'#eb5b3c'}">
          ${(s?.realizedPL??0)>=0?'+':''}₹${Math.abs(s?.realizedPL??0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="card-label">Unrealised P&amp;L</div>
        <div class="card-val" style="color:${(s?.unrealizedPL??0)>=0?'#00b386':'#eb5b3c'}">
          ${(s?.unrealizedPL??0)>=0?'+':''}₹${Math.abs(s?.unrealizedPL??0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="card-label">Charges &amp; Taxes</div>
        <div class="card-val" style="color:#eb5b3c">-₹${(s?.chargesAndTaxes??0).toFixed(2)}</div></div>
      <div class="card"><div class="card-label">Net Realised P&amp;L</div>
        <div class="card-val" style="color:${netColor}">${(s?.netRealizedPL??0)>=0?'+':''}₹${(s?.netRealizedPL??0).toFixed(2)}</div></div>
      <div class="card"><div class="card-label">Trades</div>
        <div class="card-val">${trades.length} <span style="font-size:10px;color:#888">(${s?.winningTrades??0}W / ${s?.losingTrades??0}L)</span></div></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Symbol</th><th>Date</th><th>Buy Qty</th><th>Sell Qty</th>
        <th>Buy Avg</th><th>Sell Avg</th><th>Buy Value</th><th>Sell Value</th>
        <th>Realised P&amp;L</th><th>P&amp;L%</th><th>Charges</th></tr></thead>
      <tbody>${trRows}</tbody>
    </table>
    <div class="footer">Generated by Zerodha Kite &nbsp;|&nbsp; ${new Date().toLocaleString('en-IN')}</div>
    </body></html>`;

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const destName = `PnL_${segLabel.replace(/\s+/g,'_')}_${fromDate}_${toDate}.pdf`;
    const destFile = new FileSystem.File(FileSystem.Paths.join(FileSystem.Paths.cache, destName));
    await new FileSystem.File(uri).move(destFile);
    await shareFile(destFile.uri, 'application/pdf', 'com.adobe.pdf');
  };

  const handleExport = async (fmt) => {
    setShowDownloadPicker(false);
    setExporting(true);
    try {
      if (fmt === 'excel') await downloadExcel();
      else if (fmt === 'csv') await downloadCSV();
      else await downloadPDF();
    } catch (e) {
      Alert.alert('Export failed', e.message);
    } finally { setExporting(false); }
  };

  /* keep old name so the Tax P&L button still works */
  const handleDownloadCSV = openDownload;

  const segLabel = SEGMENTS.find(s => s.key === segment)?.label || 'Combined';
  const trades   = pnlData?.trades || [];
  const totalPages = Math.ceil(trades.length / PAGE_SIZE);
  const pagedTrades= trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const s = pnlData?.summary;

  return (
    <View style={[sc.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── TOP BAR ── */}
      <View style={sc.topBar}>
        {navigation?.canGoBack?.() && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={sc.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
        )}
        <Image source={KITE_LOGO} style={sc.logoImg} resizeMode="contain" />
        <Text style={sc.topBarTitle}>P&L</Text>
        {hasLoaded && !loading && (
          <TouchableOpacity style={sc.downloadBtn} onPress={openDownload}>
            <Ionicons name="download-outline" size={18} color="#1b5fe4" />
            <Text style={sc.downloadText}>Export</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={sc.menuBtn} onPress={() => setShowFilter(true)}>
          <Ionicons name="menu" size={24} color="#444" />
        </TouchableOpacity>
      </View>

      {/* ── DATE RANGE BAR ── */}
      <TouchableOpacity style={sc.dateBar} onPress={() => setShowDatePicker(true)}>
        <Text style={sc.dateBarText}>{fromDate}  —  {toDate}</Text>
      </TouchableOpacity>

      {/* ── SEGMENT CHIPS ── */}
      <View style={sc.chips}>
        {segment !== 'combined' && (
          <View style={sc.chip}><Text style={sc.chipText}>{segLabel}</Text></View>
        )}
        <View style={sc.chip}><Text style={sc.chipText}>Combined</Text></View>
      </View>

      <View style={sc.divider} />

      {/* ── CONTENT ── */}
      {loading ? (
        <View style={sc.centerBox}>
          <ActivityIndicator size="large" color="#1b5fe4" />
          <Text style={{ color:'#888', marginTop:16, fontSize:14 }}>Fetching P&L data…</Text>
        </View>
      ) : error ? (
        <View style={sc.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color="#eb5b3c" />
          <Text style={{ color:'#eb5b3c', marginTop:12, textAlign:'center', fontSize:14 }}>{error}</Text>
          <TouchableOpacity style={sc.retryBtn} onPress={handleGenerate}>
            <Text style={sc.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !hasLoaded ? (
        <ScrollView contentContainerStyle={sc.centerBox}>
          <RobotEmoji />
          <Text style={sc.emptyTitle}>Build a report</Text>
          <Text style={sc.emptySubtitle}>Use the above form to generate a report</Text>
          <TouchableOpacity style={sc.generateBtn} onPress={handleGenerate}>
            <Text style={sc.generateText}>Generate Report  →</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          {/* View toggle */}
          {hasLoaded && (
            <View style={sc.viewToggleWrap}>
              {[['trades', 'Trade History'], ['monthly', 'Monthly Breakdown']].map(([key, label]) => (
                <TouchableOpacity key={key} onPress={() => setView(key)}
                  style={[sc.viewToggleBtn, view === key && sc.viewToggleBtnActive]}>
                  <Text style={[sc.viewToggleText, view === key && sc.viewToggleTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Monthly breakdown view */}
          {view === 'monthly' && hasLoaded && (
            monthlyLoading ? (
              <View style={sc.centerBox}>
                <ActivityIndicator size="large" color="#1b5fe4" />
                <Text style={{ color: '#888', marginTop: 12, fontSize: 14 }}>Loading monthly data…</Text>
              </View>
            ) : (
              <MonthlyBreakdownView
                months={monthlyData?.months || []}
                totals={monthlyData?.totals || { totalNetPL: 0, totalCharges: 0, totalRealizedPL: 0, totalTrades: 0, totalTurnover: 0 }}
                initialBalance={monthlyData?.initialBalance || 34000000}
              />
            )
          )}

          {/* Trade history view */}
          {view === 'trades' && (
        <FlatList
          data={pagedTrades}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={sc.listContent}
          ListHeaderComponent={() => (
            <>
              {/* Summary card */}
              <View style={sc.summaryCard}>
                <View style={sc.summaryRow}>
                  <View>
                    <Text style={sc.sumLabel}>Realised P&L</Text>
                    <Text style={[sc.sumVal, { color: s.realizedPL >= 0 ? '#00b386' : '#eb5b3c' }]}>
                      {formatAmt(s.realizedPL)}
                    </Text>
                  </View>
                  <View style={{ alignItems:'flex-end' }}>
                    <Text style={sc.sumLabel}>Unrealised P&L</Text>
                    <Text style={[sc.sumVal, { color: s.unrealizedPL >= 0 ? '#333' : '#eb5b3c' }]}>
                      {s.unrealizedPL === 0 ? '0' : formatAmt(s.unrealizedPL)}
                    </Text>
                  </View>
                </View>

                <View style={sc.sumDivider} />

                <View style={sc.sumLine}>
                  <Text style={sc.sumLineLabel}>Charges & taxes</Text>
                  <Text style={sc.sumLineVal}>{formatAmt(s.chargesAndTaxes)}</Text>
                </View>
                <View style={sc.sumLine}>
                  <Text style={sc.sumLineLabel}>Other credits & debits</Text>
                  <Text style={sc.sumLineVal}>{s.otherCreditsDebits}</Text>
                </View>
                <View style={sc.sumLine}>
                  <Text style={sc.sumLineLabel}>Net realised P&L</Text>
                  <Text style={[sc.sumLineVal,{ color: s.netRealizedPL >= 0 ? '#00b386' : '#eb5b3c', fontWeight:'700' }]}>
                    {formatAmt(s.netRealizedPL)}
                  </Text>
                </View>

                <TouchableOpacity onPress={() => setShowCharges(true)}>
                  <Text style={sc.chargesLink}>View charges breakdown →</Text>
                </TouchableOpacity>
              </View>

              {/* Tax P&L section */}
              <View style={sc.taxCard}>
                <View style={sc.taxHeader}>
                  <Ionicons name="receipt-outline" size={15} color="#1b5fe4" />
                  <Text style={sc.taxTitle}>Tax P&L Summary</Text>
                  <Text style={sc.taxPeriod}>{fromDate} – {toDate}</Text>
                </View>
                <View style={sc.taxGrid}>
                  {[
                    { label: 'Short-term gains', value: s?.realizedPL > 0 ? s.realizedPL * 0.7 : 0, color:'#00b386' },
                    { label: 'Long-term gains',  value: s?.realizedPL > 0 ? s.realizedPL * 0.3 : 0, color:'#00b386' },
                    { label: 'Short-term loss',  value: s?.realizedPL < 0 ? Math.abs(s.realizedPL) * 0.7 : 0, color:'#eb5b3c' },
                    { label: 'Turnover',         value: (pnlData?.trades||[]).reduce((a,t)=>a+t.buyValue+t.sellValue,0), color:'#555' },
                    { label: 'Total charges',    value: s?.chargesAndTaxes ?? 0, color:'#eb5b3c' },
                    { label: 'Net taxable P&L',  value: s?.netRealizedPL ?? 0, color: (s?.netRealizedPL??0)>=0?'#00b386':'#eb5b3c' },
                  ].map(({label,value,color})=>(
                    <View key={label} style={sc.taxItem}>
                      <Text style={sc.taxLabel}>{label}</Text>
                      <Text style={[sc.taxVal,{color}]}>₹{Math.abs(value).toLocaleString('en-IN',{maximumFractionDigits:2})}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={sc.csvBtn} onPress={handleDownloadCSV}>
                  <Ionicons name="download-outline" size={15} color="#fff" />
                  <Text style={sc.csvBtnText}>Download Tax P&L Excel</Text>
                </TouchableOpacity>
              </View>

              {/* Meta row */}
              <View style={sc.metaRow}>
                <View>
                  <Text style={sc.metaText}>🕐 Last updated: {pnlData.lastUpdated}</Text>
                  <Text style={sc.metaText}>📎 {pnlData.totalTrades} trades · Page {page}/{totalPages || 1}</Text>
                </View>
              </View>
              <View style={sc.divider} />
              {pagedTrades.length === 0 && (
                <Text style={{ color:'#aaa', textAlign:'center', padding:32 }}>
                  No trades found for the selected period.
                </Text>
              )}
            </>
          )}
          renderItem={({ item }) => <TradeCard trade={item} />}
          ListFooterComponent={() => totalPages > 1 ? (
            <View style={sc.pagination}>
              <TouchableOpacity
                disabled={page <= 1}
                onPress={() => setPage(p => p - 1)}
                style={[sc.pageBtn, page <= 1 && { opacity:0.4 }]}>
                <Text style={sc.pageBtnText}>← Prev</Text>
              </TouchableOpacity>
              <Text style={{ fontSize:13, color:'#555' }}>{page} / {totalPages}</Text>
              <TouchableOpacity
                disabled={page >= totalPages}
                onPress={() => setPage(p => p + 1)}
                style={[sc.pageBtn, page >= totalPages && { opacity:0.4 }]}>
                <Text style={sc.pageBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        />
          )}
        </>
      )}

      {/* ── FLOATING BOTTOM BAR (after load) ── */}
      {hasLoaded && !loading && (
        <View style={sc.floatBar}>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, flex:1 }}>
            <TouchableOpacity style={sc.filterChipBtn} onPress={() => setShowFilter(true)}>
              <Text style={sc.filterChipText}>⚙ Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sc.filterChipBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={sc.filterChipText}>📅 Date</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={sc.applyBtn} onPress={handleGenerate}>
            <Text style={sc.applyBtnText}>Apply →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── MODALS ── */}
      <DatePickerSheet
        visible={showDatePicker}
        fromDate={fromDate} toDate={toDate}
        onApply={handleApplyDate}
        onClose={() => setShowDatePicker(false)}
      />

      <FilterDrawer
        visible={showFilter}
        segment={segment}
        onSegmentChange={setSegment}
        onReset={handleResetFilter}
        onClose={() => setShowFilter(false)}
      />

      <ChargesModal
        visible={showCharges}
        fromDate={fromDate} toDate={toDate} segment={segment}
        onClose={() => setShowCharges(false)}
      />

      {/* ── Export format picker ── */}
      <Modal visible={showDownloadPicker} transparent animationType="slide" onRequestClose={() => setShowDownloadPicker(false)}>
        <TouchableOpacity style={sc.pickerOverlay} activeOpacity={1} onPress={() => setShowDownloadPicker(false)}>
          <View style={sc.pickerSheet}>
            <View style={sc.pickerHandle} />
            <Text style={sc.pickerTitle}>Download Report</Text>
            <Text style={sc.pickerSub}>{fromDate}  →  {toDate}  ·  {segLabel}</Text>

            <TouchableOpacity style={sc.fmtRow} onPress={() => handleExport('excel')}>
              <View style={[sc.fmtIcon, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="grid-outline" size={22} color="#2e7d32" />
              </View>
              <View style={sc.fmtInfo}>
                <Text style={sc.fmtName}>Excel (.xlsx)</Text>
                <Text style={sc.fmtDesc}>Two sheets: Trades + Summary. Open in Excel / Google Sheets.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity style={sc.fmtRow} onPress={() => handleExport('csv')}>
              <View style={[sc.fmtIcon, { backgroundColor: '#e3f2fd' }]}>
                <Ionicons name="document-text-outline" size={22} color="#1565c0" />
              </View>
              <View style={sc.fmtInfo}>
                <Text style={sc.fmtName}>CSV (.csv)</Text>
                <Text style={sc.fmtDesc}>Plain text, all columns. Import into any spreadsheet app.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity style={sc.fmtRow} onPress={() => handleExport('pdf')}>
              <View style={[sc.fmtIcon, { backgroundColor: '#fce4ec' }]}>
                <Ionicons name="document-outline" size={22} color="#c62828" />
              </View>
              <View style={sc.fmtInfo}>
                <Text style={sc.fmtName}>PDF (.pdf)</Text>
                <Text style={sc.fmtDesc}>Formatted report with summary cards. Print or share.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity style={sc.pickerCancel} onPress={() => setShowDownloadPicker(false)}>
              <Text style={sc.pickerCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Exporting spinner overlay ── */}
      {exporting && (
        <View style={sc.exportingOverlay}>
          <View style={sc.exportingCard}>
            <ActivityIndicator color="#387ed1" size="large" />
            <Text style={sc.exportingTxt}>Generating file…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* ── Screen styles ── */
const sc = StyleSheet.create({
  safe: { flex:1, backgroundColor:'#f8f9fa' },

  topBar: {
    flexDirection:'row', alignItems:'center',
    backgroundColor:'#fff', paddingHorizontal:16,
    paddingVertical:12,
    borderBottomWidth:1, borderBottomColor:'#e5e7eb',
  },
  backBtn: { marginRight:8 },
  logoImg: {
    width: 34, height: 34,
  },
  topBarTitle: {
    flex:1, textAlign:'center', fontSize:17, fontWeight:'500', color:'#222',
    marginHorizontal:8,
  },
  menuBtn: { padding:4 },
  downloadBtn: { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#dce4ff', backgroundColor:'#f5f7ff', marginRight:6 },
  downloadText: { fontSize:12, fontWeight:'700', color:'#1b5fe4' },

  dateBar: {
    backgroundColor:'#f0f0f0', borderRadius:40,
    marginHorizontal:16, marginTop:14, marginBottom:10,
    paddingVertical:12, paddingHorizontal:20, alignItems:'center',
  },
  dateBarText: { fontSize:14, color:'#888', fontWeight:'500' },

  chips: { flexDirection:'row', flexWrap:'wrap', gap:8, paddingHorizontal:16, paddingBottom:12 },
  chip: {
    borderWidth:1.5, borderColor:'#1b5fe4', borderRadius:40,
    paddingVertical:5, paddingHorizontal:16,
  },
  chipText: { color:'#1b5fe4', fontSize:13, fontWeight:'500' },

  divider: { height:1, backgroundColor:'#e5e7eb' },

  centerBox: {
    flex:1, alignItems:'center', justifyContent:'center', padding:32,
  },
  emptyTitle: { fontSize:22, fontWeight:'700', color:'#222', marginTop:16, marginBottom:8 },
  emptySubtitle: { fontSize:14, color:'#888', textAlign:'center', lineHeight:22 },
  generateBtn: {
    marginTop:24, backgroundColor:'#1b5fe4', borderRadius:10,
    paddingVertical:13, paddingHorizontal:28,
  },
  generateText: { color:'#fff', fontSize:15, fontWeight:'700' },

  retryBtn: {
    marginTop:16, backgroundColor:'#eb5b3c', borderRadius:10,
    paddingVertical:10, paddingHorizontal:24,
  },
  retryText: { color:'#fff', fontSize:14, fontWeight:'600' },

  listContent: { padding:16, paddingBottom:100 },

  summaryCard: {
    backgroundColor:'#fff', borderRadius:14, padding:16,
    marginBottom:12, elevation:1,
    shadowColor:'#000', shadowOffset:{ width:0,height:1 },
    shadowOpacity:0.05, shadowRadius:4,
    borderWidth:1, borderColor:'#f0f0f0',
  },
  summaryRow: { flexDirection:'row', justifyContent:'space-between', marginBottom:14 },
  sumLabel: { fontSize:12, color:'#888', marginBottom:6 },
  sumVal: { fontSize:22, fontWeight:'800' },
  sumDivider: { height:1, backgroundColor:'#f0f0f0', marginBottom:12 },
  sumLine: { flexDirection:'row', justifyContent:'space-between', paddingVertical:5 },
  sumLineLabel: { fontSize:13, color:'#888' },
  sumLineVal: { fontSize:13, color:'#333', fontWeight:'500' },
  taxCard: { backgroundColor:'#f8faff', borderRadius:12, padding:14, marginBottom:12, borderWidth:1, borderColor:'#dce4ff' },
  taxHeader: { flexDirection:'row', alignItems:'center', gap:6, marginBottom:12 },
  taxTitle: { fontSize:13, fontWeight:'700', color:'#222', flex:1 },
  taxPeriod: { fontSize:11, color:'#888' },
  taxGrid: { flexDirection:'row', flexWrap:'wrap', gap:0 },
  taxItem: { width:'50%', paddingVertical:7, paddingRight:8 },
  taxLabel: { fontSize:11, color:'#888', marginBottom:2 },
  taxVal: { fontSize:13, fontWeight:'700' },
  csvBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'#1b5fe4', borderRadius:8, paddingVertical:10, marginTop:12 },
  csvBtnText: { color:'#fff', fontSize:13, fontWeight:'700' },

  // ── Export picker ──
  pickerOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end' },
  pickerSheet: { backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20, paddingTop:12, paddingBottom:32, paddingHorizontal:20 },
  pickerHandle: { width:40, height:4, borderRadius:2, backgroundColor:'#d1d5db', alignSelf:'center', marginBottom:16 },
  pickerTitle: { fontSize:17, fontWeight:'700', color:'#1a1a1a', marginBottom:4 },
  pickerSub: { fontSize:12, color:'#888', marginBottom:20 },
  fmtRow: { flexDirection:'row', alignItems:'center', paddingVertical:14, borderBottomWidth:1, borderBottomColor:'#f3f4f6', gap:14 },
  fmtIcon: { width:44, height:44, borderRadius:12, alignItems:'center', justifyContent:'center' },
  fmtInfo: { flex:1 },
  fmtName: { fontSize:15, fontWeight:'600', color:'#1a1a1a', marginBottom:2 },
  fmtDesc: { fontSize:12, color:'#6b7280' },
  pickerCancel: { marginTop:18, paddingVertical:14, alignItems:'center', backgroundColor:'#f3f4f6', borderRadius:12 },
  pickerCancelTxt: { fontSize:15, fontWeight:'600', color:'#374151' },
  exportingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center', zIndex:999 },
  exportingCard: { backgroundColor:'#fff', borderRadius:16, padding:28, alignItems:'center', gap:14, minWidth:160 },
  exportingTxt: { fontSize:14, color:'#374151', fontWeight:'600' },
  chargesLink: {
    color:'#1b5fe4', fontSize:13, fontWeight:'600',
    marginTop:10, textDecorationLine:'underline',
  },

  metaRow: {
    flexDirection:'row', justifyContent:'space-between',
    paddingVertical:12, marginBottom:8,
  },
  metaText: { fontSize:12, color:'#999', marginBottom:2 },

  pagination: {
    flexDirection:'row', justifyContent:'space-between',
    alignItems:'center', paddingVertical:16, marginTop:8,
  },
  pageBtn: {
    backgroundColor:'#fff', borderWidth:1, borderColor:'#ddd',
    borderRadius:8, paddingVertical:8, paddingHorizontal:16,
  },
  pageBtnText: { color:'#1b5fe4', fontSize:13, fontWeight:'600' },

  viewToggleWrap: {
    flexDirection: 'row',
    margin: 12,
    marginBottom: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    padding: 3,
  },
  viewToggleBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center',
  },
  viewToggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  viewToggleText: { fontSize: 13, fontWeight: '500', color: '#888' },
  viewToggleTextActive: { color: '#1b5fe4', fontWeight: '700' },

  floatBar: {
    flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    backgroundColor:'#fff', paddingHorizontal:16, paddingVertical:12,
    borderTopWidth:1, borderTopColor:'#e5e7eb',
    elevation:8,
    shadowColor:'#000', shadowOffset:{ width:0,height:-2 },
    shadowOpacity:0.07, shadowRadius:6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  filterChipBtn: {
    backgroundColor:'#f5f7ff', borderWidth:1, borderColor:'#dce4ff',
    borderRadius:20, paddingVertical:6, paddingHorizontal:14,
  },
  filterChipText: { color:'#1b5fe4', fontSize:12, fontWeight:'500' },
  applyBtn: {
    backgroundColor:'#1b5fe4', borderRadius:10,
    paddingVertical:10, paddingHorizontal:22,
  },
  applyBtnText: { color:'#fff', fontSize:14, fontWeight:'700' },
});
