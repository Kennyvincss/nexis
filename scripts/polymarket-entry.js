// Entry for js/vendor/polymarket-trade.js (run `npm run vendor:polymarket` to rebuild).
import { ClobClient, Side, OrderType, AssetType, getContractConfig } from '@polymarket/clob-client';
import { createWalletClient, createPublicClient, custom, erc20Abi, maxUint256, parseAbi, formatUnits, parseUnits } from 'viem';
import { polygon } from 'viem/chains';
window.NexisPolymarket = { ClobClient, Side, OrderType, AssetType, getContractConfig, createWalletClient, createPublicClient, custom, erc20Abi, maxUint256, parseAbi, formatUnits, parseUnits, polygon };
