import * as dotenv from 'dotenv';
import { constants, providers, Wallet } from 'ethers';
dotenv.config();

export function parseWallets(): {
  l1Provider: providers.JsonRpcProvider;
  l2Provider: providers.JsonRpcProvider;
  l1Token: string;
  l2Token: string;
  l1Wallet: Wallet;
  l2Wallet: Wallet;
} {
  const prefix: string = String(process.env.ETH_NETWORK).toUpperCase();

  const l1Rpc = process.env[`${prefix}_L1_RPC`];
  const l2Rpc = process.env[`${prefix}_L2_RPC`];
  const l1Token = process.env[`${prefix}_L1_NFT_ADDERSS`] ?? constants.AddressZero;
  const l2Token = process.env[`${prefix}_L2_NFT_ADDERSS`] ?? constants.AddressZero;
  const privateKey = process.env[`${prefix}_PRIVATE_KEY`];

  const l1Provider = new providers.JsonRpcProvider(l1Rpc as string);
  const l2Provider = new providers.JsonRpcProvider(l2Rpc as string);

  const l1Wallet = new Wallet(privateKey as string, l1Provider);
  const l2Wallet = new Wallet(privateKey as string, l2Provider);

  return { l1Provider, l2Provider, l1Token, l2Token, l1Wallet, l2Wallet };
}
