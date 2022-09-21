/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2021, Offchain Labs, Inc.
 * Modifications Copyright 2022, chicunic
 */

import { defaultAbiCoder } from '@ethersproject/abi';
import { Signer } from '@ethersproject/abstract-signer';
import { Provider, BlockTag } from '@ethersproject/abstract-provider';
import { PayableOverrides, Overrides } from '@ethersproject/contracts';
import { Zero } from '@ethersproject/constants';
import { BigNumber, ethers } from 'ethers';

import {
  L1ToL2MessageGasEstimator,
  L2TransactionReceipt,
  L2ContractTransaction,
  L1ContractTransaction,
  L1TransactionReceipt,
  L2Network,
  EventFetcher,
} from '@arbitrum/sdk';
import { L1GatewayRouter__factory } from '@arbitrum/sdk/dist/lib/abi/factories/L1GatewayRouter__factory';
import { L2GatewayRouter__factory } from '@arbitrum/sdk/dist/lib/abi/factories/L2GatewayRouter__factory';
import { GatewaySetEvent } from '@arbitrum/sdk/dist/lib/abi/L1GatewayRouter';
import { AssetBridger } from '@arbitrum/sdk/dist/lib/assetBridger/assetBridger';
import { EthDepositParams, EthWithdrawParams } from '@arbitrum/sdk/dist/lib/assetBridger/ethBridger';
import { DISABLED_GATEWAY } from '@arbitrum/sdk/dist/lib/dataEntities/constants';
import { ArbSdkError, MissingProviderArbSdkError } from '@arbitrum/sdk/dist/lib/dataEntities/errors';
import { SignerProviderUtils } from '@arbitrum/sdk/dist/lib/dataEntities/signerOrProvider';
import { GasOverrides } from '@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator';
import { L1ContractCallTransaction } from '@arbitrum/sdk/dist/lib/message/L1Transaction';
import { getBaseFee } from '@arbitrum/sdk/dist/lib/utils/lib';

import { ERC721 } from '../../typechain-types/@openzeppelin/contracts/token/ERC721';
import { WithdrawalInitiatedEvent } from '../../typechain-types/contracts/arbitrum/gateway/L2ArbitrumGateway';
import { IL2Token } from '../../typechain-types/contracts/arbitrum/IL2Token';
import { ERC721__factory } from '../../typechain-types/factories/@openzeppelin/contracts/token/ERC721/ERC721__factory';
import { L2ArbitrumGateway__factory } from '../../typechain-types/factories/contracts/arbitrum/gateway/L2ArbitrumGateway__factory';
import { L2CustomGateway__factory } from '../../typechain-types/factories/contracts/arbitrum/gateway/L2CustomGateway__factory';
import { IL2Token__factory } from '../../typechain-types/factories/contracts/arbitrum/IL2Token__factory';
import { L1CustomGateway__factory } from '../../typechain-types/factories/contracts/ethereum/gateway/L1CustomGateway__factory';
import { IL1Token__factory } from '../../typechain-types/factories/contracts/ethereum/IL1Token__factory';

export interface TokenApproveParams {
  l1Signer: Signer;
  erc721L1Address: string;
  overrides?: PayableOverrides;
}

export interface TokenDepositParams extends EthDepositParams {
  l2Provider: Provider;
  erc721L1Address: string;
  destinationAddress?: string;
  tokenIds: BigNumber[];
  retryableGasOverrides?: GasOverrides;
  overrides?: Overrides;
}

export interface TokenWithdrawParams extends EthWithdrawParams {
  erc721l1Address: string;
}

export class Erc721Bridger extends AssetBridger<TokenDepositParams, TokenWithdrawParams> {
  public static MIN_CUSTOM_DEPOSIT_GAS_LIMIT = BigNumber.from(275000);

  public constructor(l2Network: L2Network) {
    super(l2Network);
  }

  /**
   * Get the address of the l1 gateway for this token
   * @param erc721L1Address
   * @param l1Provider
   * @returns
   */
  public async getL1GatewayAddress(erc721L1Address: string, l1Provider: Provider): Promise<string> {
    await this.checkL1Network(l1Provider);

    return await L1GatewayRouter__factory.connect(this.l2Network.tokenBridge.l1GatewayRouter, l1Provider).getGateway(
      erc721L1Address
    );
  }

  /**
   * Get the address of the l2 gateway for this token
   * @param erc721L1Address
   * @param l2Provider
   * @returns
   */
  public async getL2GatewayAddress(erc721L1Address: string, l2Provider: Provider): Promise<string> {
    await this.checkL2Network(l2Provider);

    return await L2GatewayRouter__factory.connect(this.l2Network.tokenBridge.l2GatewayRouter, l2Provider).getGateway(
      erc721L1Address
    );
  }

  /**
   * Approve tokens for deposit to the bridge. The tokens will be approved for the relevant gateway.
   * @param params
   * @returns
   */
  public async approveToken(params: TokenApproveParams): Promise<ethers.ContractTransaction> {
    if (!SignerProviderUtils.signerHasProvider(params.l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }
    await this.checkL1Network(params.l1Signer);

    // you approve tokens to the gateway that the router will use
    const gatewayAddress = await this.getL1GatewayAddress(params.erc721L1Address, params.l1Signer.provider);
    const contract = ERC721__factory.connect(params.erc721L1Address, params.l1Signer);
    return await contract.functions.setApprovalForAll(gatewayAddress, true, params.overrides ?? {});
  }

  /**
   * Get the L2 events created by a withdrawal
   * @param l2Provider
   * @param gatewayAddress
   * @param l1TokenAddress
   * @param fromAddress
   * @param filter
   * @returns
   */
  public async getL2WithdrawalEvents(
    l2Provider: Provider,
    gatewayAddress: string,
    filter: { fromBlock: BlockTag; toBlock: BlockTag },
    l1TokenAddress?: string,
    fromAddress?: string
  ): Promise<Array<WithdrawalInitiatedEvent['args'] & { txHash: string }>> {
    await this.checkL2Network(l2Provider);

    const eventFetcher = new EventFetcher(l2Provider);
    const events = (
      await eventFetcher.getEvents(
        gatewayAddress,
        L2ArbitrumGateway__factory,
        (contract) => contract.filters.WithdrawalInitiated(null, fromAddress ?? null),
        filter
      )
    ).map((a) => ({ txHash: a.transactionHash, ...a.event }));

    return l1TokenAddress != null
      ? events.filter((log) => log.l1Token.toLocaleLowerCase() === l1TokenAddress.toLocaleLowerCase())
      : events;
  }

  /**
   * Get the L2 token contract at the provided address
   * Note: This function just returns a typed ethers object for the provided address, it doesnt
   * check the underlying form of the contract bytecode to see if it's an erc721, and doesn't ensure the validity
   * of any of the underlying functions on that contract.
   * @param l2Provider
   * @param l2TokenAddr
   * @returns
   */
  public getL2TokenContract(l2Provider: Provider, l2TokenAddr: string): IL2Token {
    return IL2Token__factory.connect(l2TokenAddr, l2Provider);
  }

  /**
   * Get the L1 token contract at the provided address
   * Note: This function just returns a typed ethers object for the provided address, it doesnt
   * check the underlying form of the contract bytecode to see if it's an erc721, and doesn't ensure the validity
   * of any of the underlying functions on that contract.
   * @param l1Provider
   * @param l1TokenAddr
   * @returns
   */
  public getL1TokenContract(l1Provider: Provider, l1TokenAddr: string): ERC721 {
    return ERC721__factory.connect(l1TokenAddr, l1Provider);
  }

  /**
   * Get the corresponding L2 for the provided L1 token
   * @param erc721L1Address
   * @param l1Provider
   * @returns
   */
  public async getL2ERC721Address(erc721L1Address: string, l1Provider: Provider): Promise<string> {
    await this.checkL1Network(l1Provider);

    const l1GatewayRouter = L1GatewayRouter__factory.connect(this.l2Network.tokenBridge.l1GatewayRouter, l1Provider);

    return await l1GatewayRouter.functions.calculateL2TokenAddress(erc721L1Address).then(([res]) => res);
  }

  /**
   * Get the corresponding L1 for the provided L2 token
   * Validates the returned address against the l2 router to ensure it is correctly mapped to the provided erc721L2Address
   * @param erc721L2Address
   * @param l2Provider
   * @returns
   */
  public async getL1ERC721Address(erc721L2Address: string, l2Provider: Provider): Promise<string> {
    await this.checkL2Network(l2Provider);

    const arbERC721 = IL2Token__factory.connect(erc721L2Address, l2Provider);
    const l1Address = await arbERC721.functions.l1Address().then(([res]) => res);

    // check that this l1 address is indeed registered to this l2 token
    const l2GatewayRouter = L2GatewayRouter__factory.connect(this.l2Network.tokenBridge.l2GatewayRouter, l2Provider);

    const l2Address = await l2GatewayRouter.calculateL2TokenAddress(l1Address);
    if (l2Address.toLowerCase() !== erc721L2Address.toLowerCase()) {
      throw new ArbSdkError(
        `Unexpected l1 address. L1 address from token is not registered to the provided l2 address. ${l1Address} ${l2Address} ${erc721L2Address}`
      );
    }

    return l1Address;
  }

  /**
   * Whether the token has been disabled on the router
   * @param l1TokenAddress
   * @param l1Provider
   * @returns
   */
  public async l1TokenIsDisabled(l1TokenAddress: string, l1Provider: Provider): Promise<boolean> {
    await this.checkL1Network(l1Provider);

    const l1GatewayRouter = L1GatewayRouter__factory.connect(this.l2Network.tokenBridge.l1GatewayRouter, l1Provider);

    return (await l1GatewayRouter.l1TokenToGateway(l1TokenAddress)) === DISABLED_GATEWAY;
  }

  private async validateDepositParams(params: TokenDepositParams): Promise<void> {
    if (!SignerProviderUtils.signerHasProvider(params.l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }
    await this.checkL1Network(params.l1Signer);
    await this.checkL2Network(params.l2Provider);
    if ((params.overrides as PayableOverrides | undefined)?.value != null) {
      throw new ArbSdkError('L1 call value should be set through l1CallValue param');
    }
  }

  public async getDepositParams(params: TokenDepositParams): Promise<{
    erc721L1Address: string;
    amount: BigNumber;
    depositCallValue: BigNumber;
    maxSubmissionFee: BigNumber;
    data: string;
    l2GasLimit: BigNumber;
    l2MaxFeePerGas: BigNumber;
    destinationAddress: string;
    retryableCallData: string;
    retryableSender: string;
    retryableDestination: string;
    retryableExcessFeeRefundAddress: string;
    retryableCallValueRefundAddress: string;
    retryableValue: BigNumber;
  }> {
    const { erc721L1Address, amount, l2Provider, l1Signer, destinationAddress, tokenIds } = params;
    const { retryableGasOverrides } = params;

    if (!SignerProviderUtils.signerHasProvider(l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }

    // 1. get the params for a gas estimate
    const l1GatewayAddress = await this.getL1GatewayAddress(erc721L1Address, l1Signer.provider);
    const l1Gateway = L1CustomGateway__factory.connect(l1GatewayAddress, l1Signer.provider);
    const sender = await l1Signer.getAddress();
    const to = destinationAddress ?? sender;
    const extraData = defaultAbiCoder.encode(['uint256[]'], [tokenIds]);
    const depositCalldata = await l1Gateway.getOutboundCalldata(erc721L1Address, sender, to, amount, extraData);

    const estimateGasCallValue = Zero;

    const l2Dest = await l1Gateway.counterpartGateway();
    const gasEstimator = new L1ToL2MessageGasEstimator(l2Provider);

    let tokenGasOverrides: GasOverrides | undefined = retryableGasOverrides;

    // we also add a hardcoded minimum gas limit for custom gateway deposits
    if (l1GatewayAddress === this.l2Network.tokenBridge.l1CustomGateway) {
      if (tokenGasOverrides == null) tokenGasOverrides = {};
      if (tokenGasOverrides.gasLimit == null) tokenGasOverrides.gasLimit = {};
      if (tokenGasOverrides.gasLimit.min == null) {
        tokenGasOverrides.gasLimit.min = Erc721Bridger.MIN_CUSTOM_DEPOSIT_GAS_LIMIT;
      }
    }

    // 2. get the gas estimates
    const baseFee = await getBaseFee(l1Signer.provider);
    const excessFeeRefundAddress = sender;
    const callValueRefundAddress = sender;
    const estimates = await gasEstimator.estimateAll(
      l1GatewayAddress,
      l2Dest,
      depositCalldata,
      estimateGasCallValue,
      baseFee,
      excessFeeRefundAddress,
      callValueRefundAddress,
      l1Signer.provider,
      tokenGasOverrides
    );

    const data = defaultAbiCoder.encode(['uint256', 'bytes'], [estimates.maxSubmissionFee, extraData]);

    return {
      l2GasLimit: estimates.gasLimit,
      maxSubmissionFee: estimates.maxSubmissionFee,
      l2MaxFeePerGas: estimates.maxFeePerGas,
      depositCallValue: estimates.totalL2GasCosts,
      destinationAddress: to,
      data,
      amount,
      erc721L1Address,
      retryableCallData: depositCalldata,
      retryableSender: l1GatewayAddress,
      retryableDestination: l2Dest,
      retryableExcessFeeRefundAddress: excessFeeRefundAddress,
      retryableCallValueRefundAddress: callValueRefundAddress,
      retryableValue: estimateGasCallValue,
    };
  }

  private async depositTxOrGas<T extends boolean>(
    params: TokenDepositParams,
    estimate: T
  ): Promise<T extends true ? BigNumber : ethers.ContractTransaction>;
  private async depositTxOrGas<T extends boolean>(
    params: TokenDepositParams,
    estimate: T
  ): Promise<BigNumber | ethers.ContractTransaction> {
    await this.validateDepositParams(params);
    const depositParams = await this.getDepositParams(params);

    const l1GatewayRouter = L1GatewayRouter__factory.connect(
      this.l2Network.tokenBridge.l1GatewayRouter,
      params.l1Signer
    );

    return await (estimate ? l1GatewayRouter.estimateGas : l1GatewayRouter.functions).outboundTransfer(
      depositParams.erc721L1Address,
      depositParams.destinationAddress,
      depositParams.amount,
      depositParams.l2GasLimit,
      depositParams.l2MaxFeePerGas,
      depositParams.data,
      {
        value: depositParams.depositCallValue,
        ...params.overrides,
      }
    );
  }

  /**
   * Estimate the gas required for a token deposit
   * @param params
   * @returns
   */
  public async depositEstimateGas(params: TokenDepositParams): Promise<BigNumber> {
    return await this.depositTxOrGas(params, true);
  }

  /**
   * Execute a token deposit from L1 to L2
   * @param params
   * @returns
   */
  public async deposit(params: TokenDepositParams): Promise<L1ContractCallTransaction> {
    const tx = await this.depositTxOrGas(params, false);
    return L1TransactionReceipt.monkeyPatchContractCallWait(tx);
  }

  private async withdrawTxOrGas<T extends boolean>(
    params: TokenWithdrawParams,
    estimate: T
  ): Promise<T extends true ? BigNumber : ethers.ContractTransaction>;
  private async withdrawTxOrGas<T extends boolean>(
    params: TokenWithdrawParams,
    estimate: T
  ): Promise<BigNumber | ethers.ContractTransaction> {
    if (!SignerProviderUtils.signerHasProvider(params.l2Signer)) {
      throw new MissingProviderArbSdkError('l2Signer');
    }
    await this.checkL2Network(params.l2Signer);

    const to = params.destinationAddress ?? (await params.l2Signer.getAddress());

    const l2GatewayRouter = L2GatewayRouter__factory.connect(
      this.l2Network.tokenBridge.l2GatewayRouter,
      params.l2Signer
    );

    return await (estimate ? l2GatewayRouter.estimateGas : l2GatewayRouter.functions)[
      'outboundTransfer(address,address,uint256,bytes)'
    ](params.erc721l1Address, to, params.amount, '0x', {
      ...(params.overrides ?? {}),
    });
  }

  /**
   * Estimate gas for withdrawing tokens from L2 to L1
   * @param params
   * @returns
   */
  public async withdrawEstimateGas(params: TokenWithdrawParams): Promise<BigNumber> {
    return await this.withdrawTxOrGas(params, true);
  }

  /**
   * Withdraw tokens from L2 to L1
   * @param params
   * @returns
   */
  public async withdraw(params: TokenWithdrawParams): Promise<L2ContractTransaction> {
    const tx = await this.withdrawTxOrGas(params, false);
    return L2TransactionReceipt.monkeyPatchWait(tx);
  }
}

/**
 * A token and gateway pair
 */
interface TokenAndGateway {
  tokenAddr: string;
  gatewayAddr: string;
}

/**
 * Admin functionality for the token bridge
 */
export class AdminErc721Bridger extends Erc721Bridger {
  /**
   * Register a custom token on the Arbitrum bridge
   * See https://developer.offchainlabs.com/docs/bridging_assets#the-arbitrum-generic-custom-gateway for more details
   * @param l1TokenAddress Address of the already deployed l1 token. Must inherit from https://developer.offchainlabs.com/docs/sol_contract_docs/md_docs/arb-bridge-peripherals/tokenbridge/ethereum/icustomtoken.
   * @param l2TokenAddress Address of the already deployed l2 token. Must inherit from https://developer.offchainlabs.com/docs/sol_contract_docs/md_docs/arb-bridge-peripherals/tokenbridge/arbitrum/iarbtoken.
   * @param l1Signer The signer with the rights to call registerTokenOnL2 on the l1 token
   * @param l2Provider Arbitrum rpc provider
   * @returns
   */
  public async registerCustomToken(
    l1TokenAddress: string,
    l2TokenAddress: string,
    l1Signer: Signer,
    l2Provider: Provider
  ): Promise<L1ContractTransaction> {
    if (!SignerProviderUtils.signerHasProvider(l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }
    await this.checkL1Network(l1Signer);
    await this.checkL2Network(l2Provider);

    const l1SenderAddress = await l1Signer.getAddress();

    const l1Token = IL1Token__factory.connect(l1TokenAddress, l1Signer);
    const l2Token = IL2Token__factory.connect(l2TokenAddress, l2Provider);

    // sanity checks
    await l1Token.deployed();
    await l2Token.deployed();

    const l1AddressFromL2 = await l2Token.l1Address();
    if (l1AddressFromL2 !== l1TokenAddress) {
      throw new ArbSdkError(
        `L2 token does not have l1 address set. Set address: ${l1AddressFromL2}, expected address: ${l1TokenAddress}.`
      );
    }
    const gasPriceEstimator = new L1ToL2MessageGasEstimator(l2Provider);

    // internally the registerTokenOnL2 sends two l1tol2 messages
    // the first registers the tokens and the second sets the gateways
    // we need to estimate gas for each of these l1tol2 messages
    // 1. registerTokenFromL1
    const il2CustomGateway = L2CustomGateway__factory.createInterface();
    const l2SetTokenCallData = il2CustomGateway.encodeFunctionData('registerTokenFromL1', [
      [l1TokenAddress],
      [l2TokenAddress],
    ]);

    const l1SignerAddr = await l1Signer.getAddress();
    const baseFee = await getBaseFee(l1Signer.provider);
    const setTokenEstimates = await gasPriceEstimator.estimateAll(
      this.l2Network.tokenBridge.l1CustomGateway,
      this.l2Network.tokenBridge.l2CustomGateway,
      l2SetTokenCallData,
      Zero,
      baseFee,
      l1SignerAddr,
      l1SignerAddr,
      l1Signer.provider
    );

    // 2. setGateway
    const iL2GatewayRouter = L2GatewayRouter__factory.createInterface();
    const l2SetGatewaysCallData = iL2GatewayRouter.encodeFunctionData('setGateway', [
      [l1TokenAddress],
      [this.l2Network.tokenBridge.l1CustomGateway],
    ]);

    const setGatwayEstimates = await gasPriceEstimator.estimateAll(
      this.l2Network.tokenBridge.l1GatewayRouter,
      this.l2Network.tokenBridge.l2GatewayRouter,
      l2SetGatewaysCallData,
      Zero,
      baseFee,
      l1SignerAddr,
      l1SignerAddr,
      l1Signer.provider
    );

    // now execute the registration
    const customRegistrationTx = await l1Token.registerTokenOnL2(
      l2TokenAddress,
      setTokenEstimates.maxSubmissionFee,
      setGatwayEstimates.maxSubmissionFee,
      setTokenEstimates.gasLimit,
      setGatwayEstimates.gasLimit,
      setGatwayEstimates.maxFeePerGas,
      setTokenEstimates.totalL2GasCosts,
      setGatwayEstimates.totalL2GasCosts,
      l1SenderAddress,
      {
        value: setTokenEstimates.totalL2GasCosts.add(setGatwayEstimates.totalL2GasCosts),
      }
    );

    return L1TransactionReceipt.monkeyPatchWait(customRegistrationTx);
  }

  /**
   * Register a custom token on the Arbitrum bridge
   * See https://developer.offchainlabs.com/docs/bridging_assets#the-arbitrum-generic-custom-gateway for more details
   * @param l1TokenAddress Address of the already deployed l1 token. Must inherit from https://developer.offchainlabs.com/docs/sol_contract_docs/md_docs/arb-bridge-peripherals/tokenbridge/ethereum/icustomtoken.
   * @param l2TokenAddress Address of the already deployed l2 token. Must inherit from https://developer.offchainlabs.com/docs/sol_contract_docs/md_docs/arb-bridge-peripherals/tokenbridge/arbitrum/iarbtoken.
   * @param l1Signer The signer with the rights to call registerTokenOnL2 on the l1 token
   * @param l2Provider Arbitrum rpc provider
   * @returns
   */
  public async forceRegisterCustomToken(
    l1TokenAddress: string,
    l2TokenAddress: string,
    l1Signer: Signer,
    l2Provider: Provider
  ): Promise<L1ContractTransaction> {
    if (!SignerProviderUtils.signerHasProvider(l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }
    await this.checkL1Network(l1Signer);
    await this.checkL2Network(l2Provider);

    const l1Token = ERC721__factory.connect(l1TokenAddress, l1Signer);
    const l2Token = IL2Token__factory.connect(l2TokenAddress, l2Provider);

    // sanity checks
    await l1Token.deployed();
    await l2Token.deployed();

    const l1AddressFromL2 = await l2Token.l1Address();
    if (l1AddressFromL2 !== l1TokenAddress) {
      throw new ArbSdkError(
        `L2 token does not have l1 address set. Set address: ${l1AddressFromL2}, expected address: ${l1TokenAddress}.`
      );
    }
    const gasPriceEstimator = new L1ToL2MessageGasEstimator(l2Provider);

    // internally the registerTokenOnL2 sends two l1tol2 messages
    // the first registers the tokens and the second sets the gateways
    // we need to estimate gas for each of these l1tol2 messages
    // 1. registerTokenFromL1
    const il2CustomGateway = L2CustomGateway__factory.createInterface();
    const l2SetTokenCallData = il2CustomGateway.encodeFunctionData('registerTokenFromL1', [
      [l1TokenAddress],
      [l2TokenAddress],
    ]);

    const l1SignerAddr = await l1Signer.getAddress();
    const baseFee = await getBaseFee(l1Signer.provider);
    const setTokenEstimates = await gasPriceEstimator.estimateAll(
      this.l2Network.tokenBridge.l1CustomGateway,
      this.l2Network.tokenBridge.l2CustomGateway,
      l2SetTokenCallData,
      Zero,
      baseFee,
      l1SignerAddr,
      l1SignerAddr,
      l1Signer.provider
    );

    // 2. setGateway
    const iL2GatewayRouter = L2GatewayRouter__factory.createInterface();
    const l2SetGatewaysCallData = iL2GatewayRouter.encodeFunctionData('setGateway', [
      [l1TokenAddress],
      [this.l2Network.tokenBridge.l1CustomGateway],
    ]);

    const setGatwayEstimates = await gasPriceEstimator.estimateAll(
      this.l2Network.tokenBridge.l1GatewayRouter,
      this.l2Network.tokenBridge.l2GatewayRouter,
      l2SetGatewaysCallData,
      Zero,
      baseFee,
      l1SignerAddr,
      l1SignerAddr,
      l1Signer.provider
    );

    // now execute the registration
    const l1CustomGateway = L1CustomGateway__factory.connect(this.l2Network.tokenBridge.l1CustomGateway, l1Signer);
    await l1CustomGateway.forceRegisterTokenToL2(
      [l1TokenAddress],
      [l2TokenAddress],
      setTokenEstimates.gasLimit,
      setGatwayEstimates.maxFeePerGas,
      setTokenEstimates.maxSubmissionFee,
      {
        value: setTokenEstimates.totalL2GasCosts,
      }
    );
    const l1GatewayRouter = L1GatewayRouter__factory.connect(this.l2Network.tokenBridge.l1GatewayRouter, l1Signer);
    const gatewayRegistrationTx = await l1GatewayRouter.setGateways(
      [l1TokenAddress],
      [this.l2Network.tokenBridge.l1CustomGateway],
      setGatwayEstimates.gasLimit,
      setGatwayEstimates.maxFeePerGas,
      setGatwayEstimates.maxSubmissionFee,
      {
        value: setGatwayEstimates.totalL2GasCosts,
      }
    );
    return L1TransactionReceipt.monkeyPatchWait(gatewayRegistrationTx);
  }

  /**
   * Get all the gateway set events on the L1 gateway router
   * @param l1Provider
   * @param customNetworkL1GatewayRouter
   * @returns
   */
  public async getL1GatewaySetEvents(
    l1Provider: Provider,
    filter: { fromBlock: BlockTag; toBlock: BlockTag }
  ): Promise<Array<GatewaySetEvent['args']>> {
    await this.checkL1Network(l1Provider);

    const l1GatewayRouterAddress = this.l2Network.tokenBridge.l1GatewayRouter;
    const eventFetcher = new EventFetcher(l1Provider);
    return (
      await eventFetcher.getEvents(
        l1GatewayRouterAddress,
        L1GatewayRouter__factory,
        (t) => t.filters.GatewaySet(),
        filter
      )
    ).map((a) => a.event);
  }

  /**
   * Get all the gateway set events on the L2 gateway router
   * @param l1Provider
   * @param customNetworkL1GatewayRouter
   * @returns
   */
  public async getL2GatewaySetEvents(
    l2Provider: Provider,
    filter: { fromBlock: BlockTag; toBlock: BlockTag },
    customNetworkL2GatewayRouter?: string
  ): Promise<Array<GatewaySetEvent['args']>> {
    if (this.l2Network.isCustom && customNetworkL2GatewayRouter == null) {
      throw new ArbSdkError('Must supply customNetworkL2GatewayRouter for custom network ');
    }
    await this.checkL2Network(l2Provider);

    const l2GatewayRouterAddress = customNetworkL2GatewayRouter ?? this.l2Network.tokenBridge.l2GatewayRouter;

    const eventFetcher = new EventFetcher(l2Provider);
    return (
      await eventFetcher.getEvents(
        l2GatewayRouterAddress,
        L1GatewayRouter__factory,
        (t) => t.filters.GatewaySet(),
        filter
      )
    ).map((a) => a.event);
  }

  /**
   * Register the provided token addresses against the provided gateways
   * @param l1Signer
   * @param l2Provider
   * @param tokenGateways
   * @returns
   */
  public async setGateways(
    l1Signer: Signer,
    l2Provider: Provider,
    tokenGateways: TokenAndGateway[]
  ): Promise<L1ContractCallTransaction> {
    if (!SignerProviderUtils.signerHasProvider(l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }
    await this.checkL1Network(l1Signer);
    await this.checkL2Network(l2Provider);

    const estimator = new L1ToL2MessageGasEstimator(l2Provider);
    const baseFee = await getBaseFee(l1Signer.provider);

    const iL2GatewayRouter = L2GatewayRouter__factory.createInterface();
    const l2SetGatewaysCallData = iL2GatewayRouter.encodeFunctionData('setGateway', [
      tokenGateways.map((tG) => tG.tokenAddr),
      tokenGateways.map((tG) => tG.gatewayAddr),
    ]);

    const l1SignerAddr = await l1Signer.getAddress();
    const estimates = await estimator.estimateAll(
      this.l2Network.tokenBridge.l1GatewayRouter,
      this.l2Network.tokenBridge.l2GatewayRouter,
      l2SetGatewaysCallData,
      Zero,
      baseFee,
      l1SignerAddr,
      l1SignerAddr,
      l1Signer.provider
    );

    const l1GatewayRouter = L1GatewayRouter__factory.connect(this.l2Network.tokenBridge.l1GatewayRouter, l1Signer);

    const res = await l1GatewayRouter.functions.setGateways(
      tokenGateways.map((tG) => tG.tokenAddr),
      tokenGateways.map((tG) => tG.gatewayAddr),
      estimates.gasLimit,
      estimates.maxFeePerGas,
      estimates.maxSubmissionFee,
      { value: estimates.totalL2GasCosts }
    );

    return L1TransactionReceipt.monkeyPatchContractCallWait(res);
  }
}
