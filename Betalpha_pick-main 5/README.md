# Crypto Portfolio & AI Journal

A modern cryptocurrency portfolio tracker with AI-powered trading journal and real-time technical analysis.

## ✨ Features

- 📊 **Real-time Price Tracking** via CoinGecko API
- 🤖 **AI-Powered Insights** for trading decisions
- 📈 **Technical Analysis** with RSI, MA, support/resistance
- 📝 **Trading Journal** with transaction history
- 🎯 **Smart Transaction Flow** with conditional BUY/SELL

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173`
 
## 🔑 Configuration

To enable the **Social Sentiment** and **Twitter Feeds** features, you need to configure the Twitter API key.

1. Create a `.env` file in the root directory.
2. Add your TwitterAPI.io key:

```env
VITE_TWITTER_API_KEY=your_api_key_here
```

> **Note:** If no API key is provided, the application will gracefully fall back to using mock data for demonstration purposes.

## 📦 Tech Stack

- React 19 + Vite
- CoinGecko API
- Technical Indicators Library
- React Router

## 🎯 Key Features

### Real-Time Technical Analysis
- RSI (Relative Strength Index)
- Moving Averages (50/200-day)
- Golden/Death Cross detection
- Support/Resistance levels

### AI Trading Journal
- Transaction feed with reasons
- Weekly performance review
- Pattern recognition
- Personalized insights

### Dynamic Ticker Support
- Supports any cryptocurrency
- Automatic price fetching
- Smart caching

## 📝 License

MIT
