import React from "react";
import Menu from "./Menu";
import IndexTicker from "./IndexTicker";

const TopBar = () => {
  return (
    <div className="topbar-container">
      <IndexTicker />
      <Menu />
    </div>
  );
};

export default TopBar;