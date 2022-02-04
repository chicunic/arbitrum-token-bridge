require('dotenv').config();

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.11',
      },
      {
        version: '0.6.11',
      },
    ],
  },
  networks: {
    l1: {
      gas: 2100000,
      gasLimit: 0,
      url: process.env.L1_RPC || '',
      accounts: process.env.L1_PRIVKEY ? [process.env.L1_PRIVKEY] : [],
    },
    l2: {
      url: process.env.L2_RPC || '',
      accounts: process.env.L2_PRIVKEY ? [process.env.L2_PRIVKEY] : [],
    },
    hardhat: {
      chainId: 4,
      forking: {
        url: process.env.L1_RPC || '',
        accounts: [{ privateKey: process.env.L1_PRIVKEY, balance: '1000000000000000000' }],
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_APIKEY,
      rinkeby: process.env.ETHERSCAN_APIKEY,
      arbitrumOne: process.env.ARBISCAN_APIKEY,
      arbitrumTestnet: process.env.ARBISCAN_APIKEY,
    },
  },
};
