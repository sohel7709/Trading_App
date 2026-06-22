import React, { useState, useContext, useEffect } from "react";
import { Tooltip, Grow } from "@mui/material";
import { useNavigate } from "react-router-dom";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import BarChartIcon from '@mui/icons-material/BarChart';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import axios from "axios";
import { io } from "socket.io-client";

import GeneralContext from "./GeneralContext";

const SOCKET_URL = "http://localhost:8080";

const WatchList = () => {
  const [watchlistStocks, setWatchlistStocks] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch watchlist from API
    axios.get('http://localhost:8080/watchlists')
      .then(res => {
        if (res.data && res.data.length > 0) {
          const stocks = res.data[0].stocks.map(symbol => ({
            name: symbol,
            price: 0,
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

  // Merge live prices into watchlist stocks
  const mergedStocks = watchlistStocks.map(stock => {
    const live = livePrices[stock.name];
    if (live) {
      return {
        ...stock,
        price: live.ltp || stock.price,
        percent: live.changePercent != null ? `${live.changePercent >= 0 ? '+' : ''}${live.changePercent.toFixed(2)}%` : stock.percent,
        isDown: (live.changePercent || 0) < 0,
      };
    }
    return stock;
  });

  if (loading) return <div className="watchlist-container"><p>Loading...</p></div>;

  return (
    <div className="watchlist-container">
      <div className="search-container">
        <input
          type="text"
          name="search"
          id="search"
          placeholder="Search eg:infy, bse, nifty fut weekly, gold mcx"
          className="search"
        />
        <span className="counts"> {mergedStocks.length} / 50</span>
      </div>

      <ul className="list">
        {mergedStocks.map((stock, index) => (
          <WatchListItem stock={stock} key={index} />
        ))}
      </ul>
    </div>
  );
};

export default WatchList;

const WatchListItem = ({ stock }) => {
  const [hover, setHover] = useState(false);

  return (
    <li onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="item">
        <p className={stock.isDown ? "down" : "up"}>{stock.name}</p>
        <div className="itemInfo">
          <span className="percent">{stock.percent}</span>
          {stock.isDown ? (
            <ArrowDropDownIcon className="down" />
          ) : (
            <ArrowDropUpIcon className="up" />
          )}
          <span className="price">{stock.price}</span>
        </div>
      </div>
      {hover && <WatchListActions uid={stock.name} />}
    </li>
  );
};

const WatchListActions = ({ uid }) => {
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
        <Tooltip title="More" arrow placement="top" TransitionComponent={Grow}>
          <button className="action"><MoreHorizIcon className="icon" /></button>
        </Tooltip>
      </span>
    </span>
  );
};
