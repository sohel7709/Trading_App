import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const SOCKET_URL = "http://localhost:8080";
const API_URL = "http://localhost:8080";

const LiveChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("Trader");
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Load chat history
    axios.get(`${API_URL}/chat/history`)
      .then(res => setMessages(res.data))
      .catch(() => {});

    // Connect to Socket.IO
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("chatMessage", (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socketRef.current?.emit("chatMessage", {
      username: username || "Trader",
      message: input.trim(),
      room: "general",
    });
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="content-inner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 className="title" style={{ marginBottom: 0 }}>
          💬 Live Trading Chat
          <span style={{ fontSize: '0.7rem', fontWeight: 400, color: connected ? '#00b386' : '#eb5b3c', marginLeft: 10 }}>
            {connected ? "● Online" : "○ Reconnecting..."}
          </span>
        </h3>
        <input
          type="text"
          placeholder="Your name"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: '0.82rem', width: 120 }}
        />
      </div>

      <div style={{
        background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', height: 420,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center', paddingTop: 40 }}>No messages yet. Say hello! 👋</p>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#f5f7fa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#4184f3' }}>{msg.username}</span>
                  <span style={{ fontSize: '0.68rem', color: '#999' }}>{formatTime(msg.createdAt || msg.timestamp)}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#444' }}>{msg.message}</p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ display: 'flex', padding: 12, borderTop: '1px solid #f0f0f0', background: '#fafafa', gap: 8 }}>
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: '0.85rem', outline: 'none' }}
          />
          <button className="btn btn-blue" onClick={sendMessage} style={{ padding: '10px 20px' }}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default LiveChat;