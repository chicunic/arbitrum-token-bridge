const _ = require('lodash');
const { networks: defaultNetworks } = require('arb-ts');

const mainnetBridge = {
  // l1GatewayRouterLogic: '',
  // l2GatewayRouterLogic: '',
  // l1GatewayRouter: '',
  // l2GatewayRouter: '',
  // l1CustomGatewayLogic: '',
  // l2CustomGatewayLogic: '',
  // l1CustomGateway: '',
  // l2CustomGateway: '',
  // l1ProxyAdmin: '',
  // l2ProxyAdmin: '',
};
const rinkebyBridge = {
  // l1GatewayRouterLogic: '',
  // l2GatewayRouterLogic: '',
  // l1GatewayRouter: '',
  // l2GatewayRouter: '',
  // l1CustomGatewayLogic: '',
  // l2CustomGatewayLogic: '',
  // l1CustomGateway: '',
  // l2CustomGateway: '',
  // l1ProxyAdmin: '',
  // l2ProxyAdmin: '',
};
const rinkebyETHBridge = {
};
const mainnetETHBridge = {
};

module.exports = {
  1: {
    chainID: '1',
    name: 'Mainnet',
    explorerUrl: 'https://etherscan.io',
    isArbitrum: false,
    partnerChainID: '42161',
    tokenBridge: _.merge(defaultNetworks[1].tokenBridge, mainnetBridge),
    ethBridge: _.merge(defaultNetworks[1].ethBridge, mainnetETHBridge),
    blockTime: 15,
    rpcURL: process.env.L1_RPC,
  },
  42161: {
    chainID: '42161',
    name: 'Arbitrum One',
    explorerUrl: 'https://arbiscan.io',
    partnerChainID: '1',
    isArbitrum: true,
    tokenBridge: _.merge(defaultNetworks[42161].tokenBridge, mainnetBridge),
    ethBridge: undefined,
    confirmPeriodBlocks: 45818,
    rpcURL: process.env.L2_RPC,
  },
  4: {
    chainID: '4',
    name: 'Rinkeby',
    explorerUrl: 'https://rinkeby.etherscan.io',
    partnerChainID: '421611',
    isArbitrum: false,
    tokenBridge: _.merge(defaultNetworks[4].tokenBridge, rinkebyBridge),
    ethBridge: _.merge(defaultNetworks[4].ethBridge, rinkebyETHBridge),
    confirmPeriodBlocks: 6545,
    blockTime: 15,
    rpcURL: process.env.L1_RPC,
  },
  421611: {
    chainID: '421611',
    name: 'ArbRinkeby',
    explorerUrl: 'https://testnet.arbiscan.io',
    partnerChainID: '4',
    isArbitrum: true,
    tokenBridge: _.merge(defaultNetworks[421611].tokenBridge, rinkebyBridge),
    ethBridge: undefined,
    confirmPeriodBlocks: 6545,
    rpcURL: process.env.L2_RPC,
  },
};
