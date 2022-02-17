const {
  Bridge,
  BridgeHelper,
  L1Bridge,
  L2Bridge,
  L1ERC20Gateway__factory,
} = require('arb-ts');
const { NodeInterface__factory } = require('arb-ts/dist/lib/abi/factories/NodeInterface__factory');
const { NODE_INTERFACE_ADDRESS } = require('arb-ts/dist/lib/precompile_addresses');
const {
  BigNumber,
  constants,
  utils,
} = require('ethers');
const { ethers } = require('hardhat');
const networks = require('./networks');

const DEFAULT_SUBMISSION_PERCENT_INCREASE = BigNumber.from(400);
const DEFAULT_MAX_GAS_PERCENT_INCREASE = BigNumber.from(50);
const MIN_CUSTOM_DEPOSIT_MAXGAS = BigNumber.from(275000);

const L1Bridge721 = class extends L1Bridge {
  async approveToken(l1TokenAddress, tokenId) {
    const gateway = await this.getGatewayAddress(l1TokenAddress);
    const erc721 = await ethers.getContractAt(
      '@openzeppelin/contracts-0.8/token/ERC721/IERC721.sol:IERC721',
      l1TokenAddress,
      this.l1Signer,
    );
    return erc721.approve(gateway, tokenId);
  }

  async approveTokenForAll(l1TokenAddress) {
    const gateway = await this.getGatewayAddress(l1TokenAddress);
    const erc721 = await ethers.getContractAt(
      '@openzeppelin/contracts-0.8/token/ERC721/IERC721.sol:IERC721',
      l1TokenAddress,
      this.l1Signer,
    );
    return erc721.setApprovalForAll(gateway, true);
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
      tokenIds,
    } = depositParams;
    const extraData = utils.defaultAbiCoder.encode(['uint256[]'], [tokenIds]);
    const data = utils.defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, extraData]);
    if (overrides.value) { throw Error('L1 call value should be set through l1CallValue param'); }
    if (depositParams.l1CallValue.eq(0)) { throw Error('L1 call value should not be zero'); }
    if (depositParams.maxSubmissionCost.eq(0)) { throw Error('Max submission cost should not be zero'); }
    return this.l1GatewayRouter.functions
      .outboundTransfer(l1TokenAddress, destinationAddress, amount, maxGas, gasPriceBid, data, { value: l1CallValue });
  }
};

const Bridge721 = class extends Bridge {
  static async init(ethSigner, arbSigner, { customNetwork } = {}) {
    if (!ethSigner.provider || !arbSigner.provider) {
      throw Error('Signer needs a provider');
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
      if (l1Network.partnerChainID !== l2Network.chainID) { throw Error('L1 and L2 networks are not connected'); }
      if (l1Network.isArbitrum) { throw Error('Connected to an Arbitrum networks as the L1...'); }
      if (!l2Network.isArbitrum) { throw Error('Connected to an L1 network as the L2...'); }
    } else {
      throw Error('Current network configuration not supported.');
    }
    if (isCustomNetwork) {
      // check routers are deployed when using a custom network configuration
      const [l1RouterCode, l2RouterCode] = await Promise.all([
        ethSigner.provider.getCode(l1Network.tokenBridge.l1GatewayRouter),
        arbSigner.provider.getCode(l2Network.tokenBridge.l2GatewayRouter),
      ]);
      if (l1RouterCode === '0x') {
        throw Error(`No code deployed to ${l1Network.tokenBridge.l1GatewayRouter} in the L1`);
      }
      if (l2RouterCode === '0x') {
        throw Error(`No code deployed to ${l2Network.tokenBridge.l2GatewayRouter} in the L2`);
      }
    }
    const l1Bridge = new L1Bridge721(l1Network, ethSigner);
    const l2Bridge = new L2Bridge(l2Network, arbSigner);
    return new Bridge721(l1Bridge, l2Bridge, isCustomNetwork);
  }

  async approveTokenForAll(l1TokenAddress) {
    return this.l1Bridge.approveTokenForAll(l1TokenAddress);
  }

  async deposit(params) {
    const depositInput = await this.getDepositTxParams(params);
    return this.l1Bridge.deposit(depositInput);
  }

  async getDepositTxParams({ l1TokenAddress, amount, retryableGasArgs = {}, destinationAddress, tokenIds }, overrides = {}) {
    const { l1CustomGateway: l1CustomGatewayAddress } = this.l1Bridge.network.tokenBridge;

    // 1. Get gas price
    const gasPriceBid = retryableGasArgs.gasPriceBid || (await this.l2Provider.getGasPrice());
    const l1GatewayAddress = await this.l1Bridge.getGatewayAddress(l1TokenAddress);

    // 2. Get submission price (this depends on size of calldata used in deposit)
    const l1Gateway = L1ERC20Gateway__factory.connect(l1GatewayAddress, this.l1Provider);
    const sender = await this.l1Bridge.getWalletAddress();
    const to = destinationAddress || sender;
    if (!Array.isArray(tokenIds)) throw Error('tokenIds must be an array');
    const extraData = utils.defaultAbiCoder.encode(['uint256[]'], [tokenIds]);
    const depositCalldata = await l1Gateway.getOutboundCalldata(l1TokenAddress, sender, to, amount, extraData);
    const maxSubmissionPricePercentIncrease = retryableGasArgs.maxSubmissionPricePercentIncrease || DEFAULT_SUBMISSION_PERCENT_INCREASE;
    const maxSubmissionPrice = BridgeHelper.percentIncrease(
      (await this.l2Bridge.getTxnSubmissionPrice(depositCalldata.length - 2))[0],
      maxSubmissionPricePercentIncrease,
    );

    // 3. Estimate gas
    const nodeInterface = NodeInterface__factory.connect(NODE_INTERFACE_ADDRESS, this.l2Provider);
    const l2Dest = await l1Gateway.counterpartGateway();
    const estimateGasCallValue = constants.Zero;

    let maxGas = retryableGasArgs.maxGas || BridgeHelper.percentIncrease(
      (await nodeInterface.estimateRetryableTicket(
        l1GatewayAddress,
        utils.parseEther('0.05').add(estimateGasCallValue) /** we add a 0.05 "deposit" buffer to pay for execution in the gas estimation  */,
        l2Dest,
        estimateGasCallValue,
        maxSubmissionPrice,
        sender,
        sender,
        0,
        gasPriceBid,
        depositCalldata,
      ))[0],
      retryableGasArgs.maxGasPercentIncrease || BigNumber.from(DEFAULT_MAX_GAS_PERCENT_INCREASE),
    );
    if (l1GatewayAddress === l1CustomGatewayAddress && maxGas.lt(MIN_CUSTOM_DEPOSIT_MAXGAS)) {
      // For insurance, we set a sane minimum max gas for the custom gateway
      maxGas = MIN_CUSTOM_DEPOSIT_MAXGAS;
    }

    // 4. Calculate total required callvalue
    let totalEthCallvalueToSend = overrides && (await overrides.value);
    if (!totalEthCallvalueToSend || BigNumber.from(totalEthCallvalueToSend).isZero()) {
      totalEthCallvalueToSend = await maxSubmissionPrice.add(gasPriceBid.mul(maxGas));
    }

    return {
      maxGas,
      gasPriceBid,
      l1CallValue: BigNumber.from(totalEthCallvalueToSend),
      maxSubmissionCost: maxSubmissionPrice,
      destinationAddress: to,
      amount,
      l1TokenAddress,
      tokenIds,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async looksLikeWethGateway() {
    return false;
  }
};

module.exports = Bridge721;
