'use strict';

const dhanDataService = require('../dhanDataService');
const marketDataService = require('../marketDataService');
const tickProcessor = require('./tickProcessor');
const { isActualMarketHours } = require('../marketRules');

function isLiveMarketActive() {
    try {
        const marketControlService = require('../services/marketControlService');
        const state = marketControlService.getMarketState ? marketControlService.getMarketState() : null;
        if (state?.isHalted) return false;
        if (state?.mode === 'SYNTHETIC' || state?.mode === 'REPLAY') return true;
    } catch { /* ignore */ }
    return isActualMarketHours('EQ') || isActualMarketHours('FO');
}

class DhanMarketFeedService {
    constructor() {
        this.isRunning = false;
        this.pollInterval = null;
    }

    /**
     * Start live market feed listener/poller
     */
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[MarketWorker] 🚀 Broker Data Worker started');

        // Initial fetch
        if (isLiveMarketActive()) {
            await this.syncMarketData();
        }

        // High-frequency broker polling / streaming loop (1 second)
        this.pollInterval = setInterval(async () => {
            try {
                if (!isLiveMarketActive()) return; // Freeze off-market polling!
                await this.syncMarketData();
            } catch (err) {
                console.warn('[MarketWorker] Feed error:', err.message);
            }
        }, 1000);
    }

    /**
     * Stop feed
     */
    stop() {
        this.isRunning = false;
        if (this.pollInterval) clearInterval(this.pollInterval);
        console.log('[MarketWorker] ⏹ Broker Data Worker stopped');
    }

    /**
     * Fetch from broker and feed to tickProcessor
     */
    async syncMarketData() {
        try {
            if (!isLiveMarketActive()) return; // Freeze off-market polling!
            await marketDataService.fetchAllStockPrices();
            const allPrices = marketDataService.getAllStockPrices();
            if (allPrices && typeof allPrices === 'object') {
                for (const [sym, quote] of Object.entries(allPrices)) {
                    if (quote && quote.ltp) {
                        await tickProcessor.processTick({
                            symbol: sym,
                            ltp: quote.ltp,
                            change: quote.change,
                            changePercent: quote.changePercent,
                            open: quote.open,
                            high: quote.high,
                            low: quote.low,
                            close: quote.close,
                            volume: quote.volume,
                            source: 'DHAN_LIVE',
                        });
                    }
                }
            }

            // Sync indices
            const indices = marketDataService.getIndexData();
            if (indices && typeof indices === 'object') {
                for (const [idxName, idxQuote] of Object.entries(indices)) {
                    if (idxQuote && idxQuote.ltp) {
                        await tickProcessor.processTick({
                            symbol: idxName,
                            ltp: idxQuote.ltp,
                            change: idxQuote.change,
                            changePercent: idxQuote.changePercent,
                            source: 'DHAN_INDEX',
                        });
                    }
                }
            }
        } catch (e) {
            // Broker rate limit or connectivity issue — backoff handled automatically
        }
    }
}

module.exports = new DhanMarketFeedService();
