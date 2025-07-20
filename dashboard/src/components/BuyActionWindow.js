import React, { useState } from "react";
import { Link } from "react-router-dom";

import axios from "axios";

import GeneralContext from "./GeneralContext";
import { useContext } from "react";

import "./BuyActionWindow.css";

const BuyActionWindow = ({ uid, mode }) => {
    const [stockQuantity, setStockQuantity] = useState(1);
    const [stockPrice, setStockPrice] = useState(0.0);
    const { closeBuyWindow, closeSellWindow } = useContext(GeneralContext);

    const handleActionClick = () => {
        console.log("Order payload:", { name: uid, qty: stockQuantity, price: stockPrice, mode: mode });
        axios.post("http://localhost:8080/newOrder", {
            name: uid,
            qty: stockQuantity,
            price: stockPrice,
            mode: mode,
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

    return (
        <div className="container" id="buy-window" draggable="true">
            <div className="regular-order">
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
                <span>Margin required ₹140.65</span>
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