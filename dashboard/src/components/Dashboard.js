import React from "react";
import { Route, Routes } from "react-router-dom";

import Apps from "./Apps";
import Funds from "./Funds";
import Holdings from "./Holdings";
import MarketMovers from "./MarketMovers";
import StockChart from "./StockChart";
import TradeBook from "./TradeBook";
import PLStatement from "./PLStatement";
import TaxPnL from "./TaxPnL";
import IndexCharts from "./IndexCharts";
import Notifications from "./Notifications";
import AdminDashboard from "./AdminDashboard";
import TradingViewWidget from "./TradingViewWidget";
import HistoricalData from "./HistoricalData";
import LiveChat from "./LiveChat";

import Orders from "./Orders";
import Positions from "./Positions";
import Summary from "./Summary";
import WatchList from "./WatchList";
import { GeneralContextProvider } from "./GeneralContext";

const Dashboard = () => {
  return (
    <div className="dashboard-container">
      <GeneralContextProvider>
        <WatchList />
      </GeneralContextProvider>
      <div className="content">
        <Routes>
          <Route exact path="/" element={<Summary />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/funds" element={<Funds />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/movers" element={<MarketMovers />} />
          <Route path="/chart" element={<StockChart />} />
          <Route path="/trades" element={<TradeBook />} />
          <Route path="/pl" element={<PLStatement />} />
          <Route path="/tax-pnl" element={<TaxPnL />} />
          <Route path="/index-charts" element={<IndexCharts />} />
          <Route path="/alerts" element={<Notifications />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/tradingview" element={<TradingViewWidget />} />
          <Route path="/history" element={<HistoricalData />} />
          <Route path="/chat" element={<LiveChat />} />
        </Routes>
      </div>
    </div>
  );
};

export default Dashboard;
