import React, { useState, useContext, useEffect } from "react";
import { Tooltip, Grow } from "@mui/material";
import { useNavigate } from "react-router-dom";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import BarChartIcon from '@mui/icons-material/BarChart';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import axios from "axios";
import { io } from "socket.io-client";

import GeneralContext from "./GeneralContext";

const SOCKET_URL = "http://localhost:8080";
const API_URL = "http://localhost:8080";

const WatchList = () => {
  const [watchlistStocks, setWatchlistStocks] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [watchlistId, setWatchlistId] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const loadWatchlist = () => {
    return axios.get(`${API_URL}/watchlists`)
      .then(res => {
        if (res.data && res.data.length > 0) {
          setWatchlistId(res.data[0]._id);
          const stocks = (res.data[0].stocks || []).map(symbol => ({
            name: symbol,
            price: 0,
            change: 0,
            percent: "0%",
            isDown: false,
          }));
          setWatchlistStocks(stocks);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching watchlist:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadWatchlist();

    // Connect to Socket.IO for live prices
    const socket = io(SOCKET_URL);

    socket.on("marketData", (data) => {
      if (data.prices) {
        setLivePrices(data.prices);
      }
    });

    socket.on("connect", () => {
      console.log("WatchList: Socket connected");
    });

    return () => socket.disconnect();
  }, []);

  // Search the full NSE universe as the user types (debounced)
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      axios.get(`${API_URL}/market/search?q=${encodeURIComponent(query.trim())}`)
        .then(res => setResults(res.data.slice(0, 10)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const addToWatchlist = async (symbol) => {
    try {
      let id = watchlistId;
      if (!id) {
        const created = await axios.post(`${API_URL}/watchlists`, { name: 'My Watchlist' });
        id = created.data._id;
        setWatchlistId(id);
      }
      await axios.post(`${API_URL}/watchlists/${id}/stock`, { stockSymbol: symbol });
      setQuery("");
      setResults([]);
      loadWatchlist();
    } catch (err) {
      console.error('Error adding stock:', err);
    }
  };

  const removeFromWatchlist = async (symbol) => {
    if (!watchlistId) return;
    try {
      await axios.delete(`${API_URL}/watchlists/${watchlistId}/stock/${symbol}`);
      loadWatchlist();
    } catch (err) {
      console.error('Error removing stock:', err);
    }
  };

  // Merge live prices into watchlist stocks
  const mergedStocks = watchlistStocks.map(stock => {
    const live = livePrices[stock.name];
    if (live) {
      return {
        ...stock,
        price: live.ltp || stock.price,
        change: live.change != null ? live.change : stock.change,
        percent: live.changePercent != null ? `${live.changePercent >= 0 ? '+' : ''}${live.changePercent.toFixed(2)}%` : stock.percent,
        isDown: (live.changePercent || 0) < 0,
      };
    }
    return stock;
  });

  if (loading) return <div className="watchlist-container"><p>Loading...</p></div>;

  const inWatchlist = new Set(watchlistStocks.map(s => s.name));

  return (
    <div className="watchlist-container">
      <div className="search-container" style={{ position: 'relative' }}>
        <input
          type="text"
          name="search"
          id="search"
          placeholder="Search (eg: infy, bse, nifty fut)"
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        <span className="counts">{mergedStocks.length} / 50</span>
        <SearchIcon style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#aaa', pointerEvents: 'none' }} />
        {results.length > 0 && (
          <ul style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: '#fff', border: '1px solid #e0e0e0', borderTop: 'none',
            listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            {results.map(r => (
              <li
                key={r.symbol}
                onClick={() => !inWatchlist.has(r.symbol) && addToWatchlist(r.symbol)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', cursor: inWatchlist.has(r.symbol) ? 'default' : 'pointer',
                  borderBottom: '1px solid #f2f2f2', fontSize: 13,
                }}
              >
                <span>
                  <strong>{r.symbol}</strong>
                  <span style={{ color: '#9b9b9b', marginLeft: 8, fontSize: 12 }}>{r.name}</span>
                </span>
                <span style={{ color: inWatchlist.has(r.symbol) ? '#9b9b9b' : '#4184f3', fontSize: 12 }}>
                  {inWatchlist.has(r.symbol) ? 'Added' : '+ Add'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="list">
        {mergedStocks.map((stock, index) => (
          <WatchListItem stock={stock} key={index} onRemove={removeFromWatchlist} />
        ))}
      </ul>
    </div>
  );
};

export default WatchList;

const WatchListItem = ({ stock, onRemove }) => {
  const [hover, setHover] = useState(false);
  const dirClass = stock.isDown ? "down" : "up";
  const changeAbs = stock.change != null ? Number(stock.change).toFixed(2) : null;

  return (
    <li onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="item">
        <p className={dirClass}>
          {stock.name}
          <span className="exchange-tag">NSE</span>
        </p>
        <div className="itemInfo">
          <span className="change">
            {changeAbs != null && <span>{changeAbs}</span>}
            <span>{stock.percent}</span>
          </span>
          {stock.isDown ? (
            <ArrowDropDownIcon className="down" />
          ) : (
            <ArrowDropUpIcon className="up" />
          )}
          <span className={`price ${dirClass}`}>{stock.price}</span>
        </div>
      </div>
      {hover && <WatchListActions uid={stock.name} onRemove={onRemove} />}
    </li>
  );
};

const WatchListActions = ({ uid, onRemove }) => {
  const { openBuyWindow, openSellWindow } = useContext(GeneralContext);
  const navigate = useNavigate();
  return (
    <span className="actions">
      <span>
        <Tooltip title="Buy (B)" arrow placement="top" TransitionComponent={Grow}>
          <button className="buy" onClick={() => openBuyWindow(uid)}>Buy</button>
        </Tooltip>
        <Tooltip title="Sell (S)" arrow placement="top" TransitionComponent={Grow}>
          <button className="sell" onClick={() => openSellWindow(uid)}>Sell</button>
        </Tooltip>
        <Tooltip title="Analytics (A)" arrow placement="top" TransitionComponent={Grow}>
          <button className="chart" onClick={() => navigate(`/chart?symbol=${uid}`)}>
            <BarChartIcon className="icon" />
          </button>
        </Tooltip>
        <Tooltip title="Remove" arrow placement="top" TransitionComponent={Grow}>
          <button className="action" onClick={() => onRemove && onRemove(uid)}>
            <DeleteOutlineIcon className="icon" />
          </button>
        </Tooltip>
      </span>
    </span>
  );
};
