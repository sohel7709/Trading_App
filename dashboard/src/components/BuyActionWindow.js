import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import GeneralContext from "./GeneralContext";
import "./BuyActionWindow.css";

const BuyActionWindow = ({ uid, mode }) => {
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockPrice, setStockPrice] = useState(0.0);
  const [stockSymbol, setStockSymbol] = useState(uid || "");
  const [orderType, setOrderType] = useState("MARKET");
  const [productType, setProductType] = useState("CNC");
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { closeBuyWindow, closeSellWindow } = useContext(GeneralContext);

  useEffect(() => {
    if (uid) {
      setStockSymbol(uid);
    }
  }, [uid]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length > 0) {
      axios.get(`http://localhost:8080/market/search?q=${q}`)
        .then(res => setSearchResults(res.data))
        .catch(() => setSearchResults([]));
    } else {
      setSearchResults([]);
    }
  };

  const selectStock = (symbol) => {
    setStockSymbol(symbol);
    setSearchQuery(symbol);
    setSearchResults([]);
  };

  const handleActionClick = () => {
    const payload = {
      stockSymbol: stockSymbol,
      qty: Number(stockQuantity),
      price: Number(stockPrice),
      mode: orderType,
      side: mode,
      productType: productType,
    };
    console.log("Order payload:", payload);
    axios.post("http://localhost:8080/newOrder", payload)
      .then(res => {
        console.log("Order response:", res.data);
      })
      .catch(err => {
        console.error("Order error:", err);
      });
    if (mode === "BUY") {
      closeBuyWindow();
    } else {
      closeSellWindow();
    }
  };

  const handleCancelClick = () => {
    if (mode === "BUY") {
      closeBuyWindow();
    } else {
      closeSellWindow();
    }
  };

  const marginRequired = stockQuantity * stockPrice * 0.25;

  return (
    <div className="container" id="buy-window" draggable="true">
      <div className="regular-order">
        <div className="search-stock">
          <fieldset>
            <legend>Stock</legend>
            <input
              type="text"
              name="stock"
              id="stock"
              placeholder="Search stock symbol..."
              onChange={handleSearch}
              value={searchQuery || stockSymbol}
            />
          </fieldset>
          {searchResults.length > 0 && (
            <ul className="search-results">
              {searchResults.map((stock, idx) => (
                <li key={idx} onClick={() => selectStock(stock.symbol)}>
                  <span className="symbol">{stock.symbol}</span>
                  <span className="name">{stock.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="inputs">
          <fieldset>
            <legend>Order Type</legend>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="SL">Stop Loss</option>
              <option value="SLM">Stop Loss Market</option>
            </select>
          </fieldset>
          <fieldset>
            <legend>Product</legend>
            <select value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="CNC">CNC (Delivery)</option>
              <option value="MIS">MIS (Intraday)</option>
            </select>
          </fieldset>
        </div>
        <div className="inputs">
          <fieldset>
            <legend>Qty.</legend>
            <input
              type="number"
              name="qty"
              id="qty"
              onChange={(e) => setStockQuantity(e.target.value)}
              value={stockQuantity}
            />
          </fieldset>
          <fieldset>
            <legend>Price</legend>
            <input
              type="number"
              name="price"
              id="price"
              step="0.05"
              onChange={(e) => setStockPrice(e.target.value)}
              value={stockPrice}
            />
          </fieldset>
        </div>
      </div>

      <div className="buttons">
        <span>Margin required ₹{marginRequired.toFixed(2)}</span>
        <div>
          <Link className={`btn ${mode === "BUY" ? "btn-blue" : "btn-red"}`} onClick={handleActionClick}>
            {mode === "BUY" ? "Buy" : "Sell"}
          </Link>
          <Link to="" className="btn btn-grey" onClick={handleCancelClick}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BuyActionWindow;