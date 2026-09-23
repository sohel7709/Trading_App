'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
    ENV: process.env.NODE_ENV || 'development',
    API_PORT: parseInt(process.env.API_PORT || process.env.PORT || '8080', 10),
    SOCKET_PORT: parseInt(process.env.SOCKET_PORT || '3001', 10),
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    DATABASE_URL: process.env.DATABASE_URL,
    ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'zerodha_access_secret_sohel_2024',
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'zerodha_refresh_secret_sohel_2024',
    DHAN_CLIENT_ID: process.env.DHAN_CLIENT_ID,
    DHAN_ACCESS_TOKEN: process.env.DHAN_ACCESS_TOKEN,
};
