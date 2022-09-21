import * as dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox'; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();

const config: HardhatUserConfig = {
  solidity: '0.8.17',
  networks: {
    mainnet: {
      chainId: 1,
      url: process.env.MAINNET_L1_RPC ?? '',
      accounts: [process.env.MAINNET_PRIVATE_KEY ?? ''],
    },
    arbitrumOne: {
      chainId: 42161,
      url: process.env.MAINNET_L2_RPC ?? '',
      accounts: [process.env.MAINNET_PRIVATE_KEY ?? ''],
    },
    goerli: {
      chainId: 5,
      url: process.env.GOERLI_L1_RPC ?? '',
      accounts: [process.env.GOERLI_PRIVATE_KEY ?? ''],
    },
    arbitrumGoerli: {
      chainId: 421613,
      url: process.env.GOERLI_L2_RPC ?? '',
      accounts: [process.env.GOERLI_PRIVATE_KEY ?? ''],
    },
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_APIKEY ?? '',
      goerli: process.env.ETHERSCAN_APIKEY ?? '',
      arbitrumOne: process.env.ARBISCAN_APIKEY ?? '',
      arbitrumGoerli: '0',
    },
    customChains: [
      {
        network: 'arbitrumGoerli',
        chainId: 421613,
        urls: {
          apiURL: 'https://goerli-rollup-explorer.arbitrum.io/api',
          browserURL: 'https://goerli-rollup-explorer.arbitrum.io',
        },
      },
    ],
  },
};

export default config;
