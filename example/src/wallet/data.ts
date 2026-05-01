export interface Token {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  color: string;
  price: number;
  change24h: number;
  balance: number;
  value: number;
  description: string;
}

export const TOKENS: Token[] = [
  {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    icon: '⬡',
    color: '#8247E5',
    price: 0.89,
    change24h: 3.42,
    balance: 1247.5,
    value: 1110.28,
    description:
      'Polygon is a protocol and framework for building and connecting Ethereum-compatible blockchain networks. It provides scalable solutions on Ethereum supporting a multi-chain ecosystem.',
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: '◇',
    color: '#627EEA',
    price: 3245.67,
    change24h: -1.23,
    balance: 2.45,
    value: 7951.89,
    description:
      'Ethereum is a decentralized, open source blockchain with smart contract functionality. Ether is the native cryptocurrency of the platform.',
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    icon: '₿',
    color: '#F7931A',
    price: 67234.5,
    change24h: 2.15,
    balance: 0.125,
    value: 8404.31,
    description:
      'Bitcoin is a decentralized digital currency that can be transferred on the peer-to-peer bitcoin network. Bitcoin transactions are verified by nodes through cryptography.',
  },
  {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    icon: '◎',
    color: '#14F195',
    price: 142.33,
    change24h: 5.67,
    balance: 15.3,
    value: 2177.65,
    description:
      'Solana is a high-performance blockchain platform designed for decentralized applications and marketplaces. It uses a unique consensus mechanism combining Proof of History and Proof of Stake.',
  },
  {
    id: 'avalanche',
    name: 'Avalanche',
    symbol: 'AVAX',
    icon: '△',
    color: '#E84142',
    price: 35.78,
    change24h: -0.89,
    balance: 42.0,
    value: 1502.76,
    description:
      'Avalanche is a layer one blockchain that functions as a platform for decentralized applications and custom blockchain networks. It aims to be fast, low cost, and eco-friendly.',
  },
  {
    id: 'chainlink',
    name: 'Chainlink',
    symbol: 'LINK',
    icon: '⬡',
    color: '#2A5ADA',
    price: 14.56,
    change24h: 1.34,
    balance: 85.0,
    value: 1237.6,
    description:
      'Chainlink is a decentralized oracle network that provides real-world data to smart contracts on the blockchain. It connects smart contracts with off-chain data and services.',
  },
];
