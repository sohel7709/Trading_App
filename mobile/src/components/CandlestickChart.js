import React, { useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/colors';

function toChartData(candles) {
  if (!candles || candles.length === 0) return { candles: [], volumes: [] };

  const seen = new Set();
  const sorted = [...candles].sort((a, b) => {
    const tA = Array.isArray(a) ? a[0] : (a.time ?? a.timestamp ?? 0);
    const tB = Array.isArray(b) ? b[0] : (b.time ?? b.timestamp ?? 0);
    return tA - tB;
  });

  const chartCandles = [];
  const volumes = [];

  for (const c of sorted) {
    let time, open, high, low, close, volume;
    if (Array.isArray(c)) {
      [time, open, high, low, close, volume = 0] = c;
    } else {
      time = c.time ?? c.timestamp ?? 0;
      open = c.open; high = c.high; low = c.low; close = c.close;
      volume = c.volume ?? 0;
    }

    if (seen.has(time)) continue;
    seen.add(time);
    if (!time || !open || !high || !low || !close) continue;
    if (high < low || open <= 0 || close <= 0) continue;

    chartCandles.push({ time, open, high, low, close });
    volumes.push({ time, value: volume, color: close >= open ? '#25B87E44' : '#E64D3D44' });
  }

  return { candles: chartCandles, volumes };
}

const CandlestickChart = forwardRef(function CandlestickChart(
  { candles = [], width, height = 260, isGain = true, livePrice = null },
  ref
) {
  const webViewRef = useRef(null);
  const { candles: chartData, volumes } = useMemo(() => toChartData(candles), [candles]);

  // Expose updateLivePrice to parent via ref
  useImperativeHandle(ref, () => ({
    updateLivePrice: (price) => {
      if (!webViewRef.current || !price) return;
      webViewRef.current.postMessage(JSON.stringify({ type: 'updateLast', price }));
    },
  }));

  // Push live price updates into the chart whenever livePrice prop changes
  useEffect(() => {
    if (!livePrice || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'updateLast', price: livePrice }));
  }, [livePrice]);

  const html = useMemo(() => {
    const upColor = '#25B87E';
    const downColor = '#E64D3D';
    const lineColor = isGain ? upColor : downColor;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#fff;overflow:hidden}
    #chart{width:100%;height:100%}
    #price-tooltip{
      position:absolute;top:8px;left:8px;z-index:10;
      background:rgba(255,255,255,0.92);border:1px solid #E8EAED;border-radius:6px;
      padding:6px 10px;font-family:-apple-system,sans-serif;font-size:11px;
      display:none;pointer-events:none;line-height:1.6;
    }
  </style>
</head>
<body>
  <div id="chart"></div>
  <div id="price-tooltip"></div>
  <script>
  (function(){
    var candleSeries, chart;
    try {
      chart = LightweightCharts.createChart(document.getElementById('chart'), {
        layout:{
          background:{type:'solid',color:'#ffffff'},
          textColor:'#6B7280',
          fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',
          fontSize:10,
        },
        grid:{
          vertLines:{color:'#F1F3F4',style:0},
          horzLines:{color:'#F1F3F4',style:0},
        },
        crosshair:{
          mode:LightweightCharts.CrosshairMode.Normal,
          vertLine:{color:'#9CA3AF44',labelBackgroundColor:'#374151'},
          horzLine:{color:'#9CA3AF44',labelBackgroundColor:'#374151'},
        },
        rightPriceScale:{
          borderColor:'#E8EAED',
          autoScale:true,
          scaleMargins:{top:0.06,bottom:0.16},
        },
        timeScale:{
          borderColor:'#E8EAED',
          timeVisible:true,
          secondsVisible:false,
          rightOffset:5,
          minBarSpacing:2,
        },
        handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
        handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},
      });

      var candleData = ${JSON.stringify(chartData)};
      var volumeData = ${JSON.stringify(volumes)};

      if (candleData.length >= 2) {
        candleSeries = chart.addCandlestickSeries({
          upColor:'${upColor}',
          downColor:'${downColor}',
          borderDownColor:'${downColor}',
          borderUpColor:'${upColor}',
          wickDownColor:'${downColor}',
          wickUpColor:'${upColor}',
          priceLineVisible: true,
          lastValueVisible: true,
        });
        candleSeries.setData(candleData);

        if (volumeData.length > 0) {
          var volSeries = chart.addHistogramSeries({
            priceFormat:{type:'volume'},
            priceScaleId:'vol',
          });
          chart.priceScale('vol').applyOptions({
            scaleMargins:{top:0.84,bottom:0},
            borderVisible:false,
          });
          volSeries.setData(volumeData);
        }

        chart.timeScale().fitContent();
      } else {
        var lineSeries = chart.addLineSeries({color:'${lineColor}',lineWidth:2});
        lineSeries.setData(candleData.map(function(c){return{time:c.time,value:c.close};}));
        chart.timeScale().fitContent();
      }

      // Crosshair tooltip
      var tooltip = document.getElementById('price-tooltip');
      chart.subscribeCrosshairMove(function(param){
        if(!param.time || !candleSeries) { tooltip.style.display='none'; return; }
        var d = param.seriesData.get(candleSeries);
        if(!d) { tooltip.style.display='none'; return; }
        var color = d.close >= d.open ? '${upColor}' : '${downColor}';
        tooltip.innerHTML =
          '<span style="color:'+color+';font-weight:700">O '+d.open.toFixed(2)+'</span> ' +
          '<span style="color:${upColor}">H '+d.high.toFixed(2)+'</span> ' +
          '<span style="color:${downColor}">L '+d.low.toFixed(2)+'</span> ' +
          '<span style="color:'+color+'">C '+d.close.toFixed(2)+'</span>';
        tooltip.style.display='block';
      });

      // Live price updates from React Native
      function handleLiveUpdate(price) {
        if(!candleSeries || !candleData.length) return;
        var last = candleData[candleData.length - 1];
        var updated = {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, price),
          low:  Math.min(last.low,  price),
          close: price,
        };
        candleSeries.update(updated);
      }

      // Android
      document.addEventListener('message', function(e){
        try{var m=JSON.parse(e.data);if(m.type==='updateLast')handleLiveUpdate(m.price);}catch(err){}
      });
      // iOS
      window.addEventListener('message', function(e){
        try{var m=JSON.parse(e.data);if(m.type==='updateLast')handleLiveUpdate(m.price);}catch(err){}
      });

      window.addEventListener('resize',function(){
        chart.applyOptions({width:window.innerWidth,height:window.innerHeight});
      });
    } catch(e) {
      document.body.innerHTML='<p style="color:#E64D3D;padding:16px;font-family:sans-serif;font-size:13px">Chart error: '+e.message+'</p>';
    }
  })();
  </script>
</body>
</html>`;
  }, [chartData, volumes, isGain]);

  if (!candles || candles.length === 0) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.placeholderTxt}>Loading chart…</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      style={{ width, height, backgroundColor: '#fff' }}
      scrollEnabled={false}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['*']}
      startInLoadingState
      renderLoading={() => (
        <View style={[styles.placeholder, { width, height, position: 'absolute' }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      onError={() => {}}
    />
  );
});

export default CandlestickChart;

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  placeholderTxt: { fontSize: 13, color: colors.textMuted },
});
