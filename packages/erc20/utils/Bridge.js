const {
  Bridge,
  L1Bridge,
  L2Bridge,
} = require('arb-ts');
const {
  utils,
} = require('ethers');
const { ethers } = require('hardhat');
const networks = require('./networks');

const L1Bridge20 = class extends L1Bridge {
  async approveToken(l1TokenAddress, amount) {
    const gateway = await this.getGatewayAddress(l1TokenAddress);
    const erc20 = await ethers.getContractAt(
      '@openzeppelin/contracts-0.8/token/ERC20/IERC20.sol:IERC20',
      l1TokenAddress,
      this.l1Signer,
    );
    return erc20.approve(gateway, amount);
  }

  async deposit(depositParams, overrides = {}) {
    const {
      maxGas,
      gasPriceBid,
      l1CallValue,
      maxSubmissionCost,
      destinationAddress,
      amount,
      l1TokenAddress,
    } = depositParams;
    const data = utils.defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, '0x']);
    if (overrides.value) { throw new Error('L1 call value should be set through l1CallValue param'); }
    if (depositParams.l1CallValue.eq(0)) { throw new Error('L1 call value should not be zero'); }
    if (depositParams.maxSubmissionCost.eq(0)) { throw new Error('Max submission cost should not be zero'); }
    return this.l1GatewayRouter.functions.outboundTransfer(l1TokenAddress, destinationAddress, amount, maxGas, gasPriceBid, data, { value: l1CallValue });
  }
};

const Bridge20 = class extends Bridge {
  static async init(ethSigner, arbSigner, { customNetwork } = {}) {
    if (!ethSigner.provider || !arbSigner.provider) {
      throw new Error('Signer needs a provider');
    }
    const [l1ChainId, l2ChainId] = await Promise.all([
      ethSigner.getChainId(),
      arbSigner.getChainId(),
    ]);
    const isCustomNetwork = customNetwork !== undefined;
    const l1Network = isCustomNetwork
      ? customNetwork.l1Network
      : networks[l1ChainId];
    const l2Network = isCustomNetwork
      ? customNetwork.l2Network
      : networks[l2ChainId];
    if (l1Network && l2Network) {
      if (l1Network.partnerChainID !== l2Network.chainID) { throw new Error('L1 and L2 networks are not connected'); }
      if (l1Network.isArbitrum) { throw new Error('Connected to an Arbitrum networks as the L1...'); }
      if (!l2Network.isArbitrum) { throw new Error('Connected to an L1 network as the L2...'); }
    } else {
      throw new Error('Current network configuration not supported.');
    }
    if (isCustomNetwork) {
      // check routers are deployed when using a custom network configuration
      const [l1RouterCode, l2RouterCode] = await Promise.all([
        ethSigner.provider.getCode(l1Network.tokenBridge.l1GatewayRouter),
        arbSigner.provider.getCode(l2Network.tokenBridge.l2GatewayRouter),
      ]);
      if (l1RouterCode === '0x') {
        throw new Error(`No code deployed to ${l1Network.tokenBridge.l1GatewayRouter} in the L1`);
      }
      if (l2RouterCode === '0x') {
        throw new Error(`No code deployed to ${l2Network.tokenBridge.l2GatewayRouter} in the L2`);
      }
    }
    const l1Bridge = new L1Bridge20(l1Network, ethSigner);
    const l2Bridge = new L2Bridge(l2Network, arbSigner);
    return new Bridge20(l1Bridge, l2Bridge, isCustomNetwork);
  }

  async deposit(params) {
    const depositInput = await this.getDepositTxParams(params);
    return this.l1Bridge.deposit(depositInput);
  }

  async getDepositTxParams({ l1TokenAddress: l1TokenAddress0, amount: amount0, destinationAddress: destinationAddress0 }) {
    const {
      maxGas,
      gasPriceBid,
      l1CallValue,
      maxSubmissionCost,
      destinationAddress,
      amount,
      erc20L1Address: l1TokenAddress,
    } = await super.getDepositTxParams({ erc20L1Address: l1TokenAddress0, amount: amount0, destinationAddress: destinationAddress0 });
    return {
      maxGas,
      gasPriceBid,
      l1CallValue,
      maxSubmissionCost,
      destinationAddress,
      amount,
      l1TokenAddress,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async looksLikeWethGateway() {
    return false;
  }
};

module.exports = Bridge20;
