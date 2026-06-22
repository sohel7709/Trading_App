import React, { useEffect, useState } from "react";
import axios from "axios";

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = () => {
    setLoading(true);
    axios.get("http://localhost:8080/allOrders")
      .then(res => {
        setOrders(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError("Error fetching orders");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrders();
    // Refresh orders every 5 seconds
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  if (loading && orders.length === 0) return <div className="orders"><p>Loading orders...</p></div>;
  if (error && orders.length === 0) return <div className="orders"><p>{error}</p></div>;

  return (
    <div className="orders">
      <h3 className="title">Orders ({orders.length})</h3>
      {orders.length === 0 ? (
        <div className="no-orders">
          <p>You haven't placed any orders yet</p>
        </div>
      ) : (
        <div className="order-table">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Type</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={idx}>
                  <td>{order.stockSymbol}</td>
                  <td className={order.side === 'BUY' ? 'profit' : 'loss'}>{order.side}</td>
                  <td>{order.quantity}</td>
                  <td>{order.price?.toFixed(2)}</td>
                  <td>{order.type}</td>
                  <td>{order.status}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Orders;