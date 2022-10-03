/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2021, Offchain Labs, Inc.
 * Modifications Copyright 2022, chicunic
 */

import { Signer } from '@ethersproject/abstract-signer';
import { Provider, BlockTag, TransactionRequest } from '@ethersproject/abstract-provider';
import { PayableOverrides, Overrides } from '@ethersproject/contracts';
import { BigNumber, BigNumberish, ethers, BytesLike } from 'ethers';

import {
  L1ToL2MessageGasEstimator,
  L2TransactionReceipt,
  L2ContractTransaction,
  L1ContractTransaction,
  L1TransactionReceipt,
  L2Network,
  EventFetcher,
  RetryableDataTools,
} from '@arbitrum/sdk';
import { L1GatewayRouter__factory } from '@arbitrum/sdk/dist/lib/abi/factories/L1GatewayRouter__factory';
import { L2GatewayRouter__factory } from '@arbitrum/sdk/dist/lib/abi/factories/L2GatewayRouter__factory';
import {
  L2ArbitrumGateway__factory,
  ERC721__factory,
  ERC721,
  IL1Token__factory,
  IL2Token__factory,
  IL2Token,
} from '../../typechain-types';

import { WithdrawalInitiatedEvent } from '../../typechain-types/contracts/arbitrum/gateway/L2ArbitrumGateway';
import { GatewaySetEvent } from '@arbitrum/sdk/dist/lib/abi/L1GatewayRouter';
import { GasOverrides } from '@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator';
import { SignerProviderUtils } from '@arbitrum/sdk/dist/lib/dataEntities/signerOrProvider';
import { ArbSdkError, MissingProviderArbSdkError } from '@arbitrum/sdk/dist/lib/dataEntities/errors';
import { DISABLED_GATEWAY } from '@arbitrum/sdk/dist/lib/dataEntities/constants';
import { EthDepositParams, EthWithdrawParams } from '@arbitrum/sdk/dist/lib/assetBridger/ethBridger';
import { AssetBridger } from '@arbitrum/sdk/dist/lib/assetBridger/assetBridger';
import { L1ContractCallTransaction } from '@arbitrum/sdk/dist/lib/message/L1Transaction';
import {
  isL1ToL2TransactionRequest,
  isL2ToL1TransactionRequest,
  L1ToL2TransactionRequest,
  L2ToL1TransactionRequest,
} from '@arbitrum/sdk/dist/lib/dataEntities/transactionRequest';
import { defaultAbiCoder } from '@ethersproject/abi';
import { OmitTyped, RequiredPick } from '@arbitrum/sdk/dist/lib/utils/types';
import { EventArgs } from '@arbitrum/sdk/dist/lib/dataEntities/event';
import { L1ToL2MessageGasParams } from '@arbitrum/sdk/dist/lib/message/L1ToL2MessageCreator';

export interface TokenApproveParams {
  erc721L1Address: string;
  overrides?: PayableOverrides;
}

export interface Erc721DepositParams extends EthDepositParams {
  l2Provider: Provider;
  erc721L1Address: string;
  tokenIds: BigNumber[];
  destinationAddress?: string;
  excessFeeRefundAddress?: string;
  callValueRefundAddress?: string;
  retryableGasOverrides?: GasOverrides;
  overrides?: Overrides;
}

export interface Erc721WithdrawParams extends EthWithdrawParams {
  erc721l1Address: string;
}

export type L1ToL2TxReqAndSignerProvider = L1ToL2TransactionRequest & {
  l1Signer: Signer;
  overrides?: Overrides;
};

export type L2ToL1TxReqAndSigner = L2ToL1TransactionRequest & {
  l2Signer: Signer;
  overrides?: Overrides;
};

type SignerTokenApproveParams = TokenApproveParams & { l1Signer: Signer };
type ProviderTokenApproveParams = TokenApproveParams & { l1Provider: Provider };
export type ApproveParamsOrTxRequest =
  | SignerTokenApproveParams
  | {
      txRequest: Required<Pick<TransactionRequest, 'to' | 'data' | 'value'>>;
      l1Signer: Signer;
      overrides?: Overrides;
    };

type DepositRequest = OmitTyped<Erc721DepositParams, 'overrides' | 'l1Signer'> & {
  l1Provider: Provider;
  from: string;
};

type DefaultedDepositRequest = RequiredPick<
  DepositRequest,
  'callValueRefundAddress' | 'excessFeeRefundAddress' | 'destinationAddress'
>;

/**
 * Bridger for moving ERC721 tokens back and forth betwen L1 to L2
 */
export class Erc721Bridger extends AssetBridger<
  Erc721DepositParams | L1ToL2TxReqAndSignerProvider,
  OmitTyped<Erc721WithdrawParams, 'from'> | L2ToL1TransactionRequest
> {
  public static MIN_CUSTOM_DEPOSIT_GAS_LIMIT = BigNumber.from(275000);

  /**
   * Bridger for moving ERC721 tokens back and forth betwen L1 to L2
   */
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
   * Get a tx request to approve tokens for deposit to the bridge.
   * The tokens will be approved for the relevant gateway.
   * @param params
   * @returns
   */
  public async getApproveTokenRequest(
    params: ProviderTokenApproveParams
  ): Promise<Required<Pick<TransactionRequest, 'to' | 'data' | 'value'>>> {
    // you approve tokens to the gateway that the router will use
    const gatewayAddress = await this.getL1GatewayAddress(
      params.erc721L1Address,
      SignerProviderUtils.getProviderOrThrow(params.l1Provider)
    );

    const iErc721Interface = ERC721__factory.createInterface();
    const data = iErc721Interface.encodeFunctionData('setApprovalForAll', [gatewayAddress, true]);

    return {
      to: params.erc721L1Address,
      data,
      value: BigNumber.from(0),
    };
  }

  private isApproveParams(params: ApproveParamsOrTxRequest): params is SignerTokenApproveParams {
    return (params as SignerTokenApproveParams).erc721L1Address !== undefined;
  }

  /**
   * Approve tokens for deposit to the bridge. The tokens will be approved for the relevant gateway.
   * @param params
   * @returns
   */
  public async approveToken(params: ApproveParamsOrTxRequest): Promise<ethers.ContractTransaction> {
    await this.checkL1Network(params.l1Signer);

    const approveRequest = this.isApproveParams(params)
      ? await this.getApproveTokenRequest({
          ...params,
          l1Provider: SignerProviderUtils.getProviderOrThrow(params.l1Signer),
        })
      : params.txRequest;
    return await params.l1Signer.sendTransaction({
      ...approveRequest,
      ...params.overrides,
    });
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
  ): Promise<Array<EventArgs<WithdrawalInitiatedEvent> & { txHash: string }>> {
    await this.checkL2Network(l2Provider);

    const eventFetcher = new EventFetcher(l2Provider);
    const events = (
      await eventFetcher.getEvents(
        L2ArbitrumGateway__factory,
        (contract) => contract.filters.WithdrawalInitiated(null, fromAddress ?? null),
        { ...filter, address: gatewayAddress }
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

  private applyDefaults<T extends DepositRequest>(params: T): DefaultedDepositRequest {
    return {
      ...params,
      excessFeeRefundAddress: params.excessFeeRefundAddress ?? params.from,
      callValueRefundAddress: params.callValueRefundAddress ?? params.from,
      destinationAddress: params.destinationAddress ?? params.from,
    };
  }

  /**
   * Get the arguments for calling the deposit function
   * @param params
   * @returns
   */
  public async getDepositRequest(params: DepositRequest): Promise<L1ToL2TransactionRequest> {
    await this.checkL1Network(params.l1Provider);
    await this.checkL2Network(params.l2Provider);
    const defaultedParams = this.applyDefaults(params);
    const { amount, destinationAddress, erc721L1Address, l1Provider, l2Provider, retryableGasOverrides, tokenIds } =
      defaultedParams;

    const l1GatewayAddress = await this.getL1GatewayAddress(erc721L1Address, l1Provider);
    let tokenGasOverrides: GasOverrides | undefined = retryableGasOverrides;

    // we also add a hardcoded minimum gas limit for custom gateway deposits
    if (l1GatewayAddress === this.l2Network.tokenBridge.l1CustomGateway) {
      if (tokenGasOverrides == null) tokenGasOverrides = {};
      if (tokenGasOverrides.gasLimit == null) tokenGasOverrides.gasLimit = {};
      if (tokenGasOverrides.gasLimit.min == null) {
        tokenGasOverrides.gasLimit.min = Erc721Bridger.MIN_CUSTOM_DEPOSIT_GAS_LIMIT;
      }
    }

    const depositFunc = (depositParams: OmitTyped<L1ToL2MessageGasParams, 'deposit'>): any => {
      const extraData = defaultAbiCoder.encode(['uint256[]'], [tokenIds]);
      const innerData = defaultAbiCoder.encode(['uint256', 'bytes'], [depositParams.maxSubmissionCost, extraData]);
      const iGatewayRouter = L1GatewayRouter__factory.createInterface();

      return {
        data: iGatewayRouter.encodeFunctionData('outboundTransfer', [
          erc721L1Address,
          destinationAddress,
          amount,
          depositParams.gasLimit,
          depositParams.maxFeePerGas,
          innerData,
        ]),
        to: this.l2Network.tokenBridge.l1GatewayRouter,
        from: defaultedParams.from,
        value: depositParams.gasLimit.mul(depositParams.maxFeePerGas).add(depositParams.maxSubmissionCost),
        // we dont include the l2 call value for token deposits because
        // they either have 0 call value, or their call value is withdrawn from
        // a contract by the gateway (weth). So in both of these cases the l2 call value
        // is not actually deposited in the value field
      };
    };

    const gasEstimator = new L1ToL2MessageGasEstimator(l2Provider);
    const estimates = await gasEstimator.populateFunctionParams(depositFunc, l1Provider, tokenGasOverrides);

    return {
      txRequest: {
        to: this.l2Network.tokenBridge.l1GatewayRouter,
        data: estimates.data,
        value: estimates.value,
        from: params.from,
      },
      retryableData: {
        ...estimates.retryable,
        ...estimates.estimates,
      },
      isValid: async () => {
        const reEstimates = await gasEstimator.populateFunctionParams(depositFunc, l1Provider, tokenGasOverrides);
        return await L1ToL2MessageGasEstimator.isValid(estimates.estimates, reEstimates.estimates);
      },
    };
  }

  /**
   * Execute a token deposit from L1 to L2
   * @param params
   * @returns
   */
  public async deposit(params: Erc721DepositParams | L1ToL2TxReqAndSignerProvider): Promise<L1ContractCallTransaction> {
    await this.checkL1Network(params.l1Signer);

    // Although the types prevent should alert callers that value is not
    // a valid override, it is possible that they pass it in anyway as it's a common override
    // We do a safety check here
    if ((params.overrides as PayableOverrides | undefined)?.value != null) {
      throw new ArbSdkError('L1 call value should be set through l1CallValue param');
    }

    const l1Provider = SignerProviderUtils.getProviderOrThrow(params.l1Signer);
    const tokenDeposit = isL1ToL2TransactionRequest(params)
      ? params
      : await this.getDepositRequest({
          ...params,
          l1Provider,
          from: await params.l1Signer.getAddress(),
        });

    const tx = await params.l1Signer.sendTransaction({
      ...tokenDeposit.txRequest,
      ...params.overrides,
    });

    return L1TransactionReceipt.monkeyPatchContractCallWait(tx);
  }

  /**
   * Get the arguments for calling the token withdrawal function
   * @param params
   * @returns
   */
  public async getWithdrawalRequest(params: Erc721WithdrawParams): Promise<L2ToL1TransactionRequest> {
    const to = params.destinationAddress;

    const routerInterface = L2GatewayRouter__factory.createInterface();
    const functionData =
      // we need to do this since typechain doesnt seem to correctly create
      // encodeFunctionData for functions with overrides
      (
        routerInterface as unknown as {
          encodeFunctionData: (
            functionFragment: 'outboundTransfer(address,address,uint256,bytes)',
            values: [string, string, BigNumberish, BytesLike]
          ) => string;
        }
      ).encodeFunctionData('outboundTransfer(address,address,uint256,bytes)', [
        params.erc721l1Address,
        to,
        params.amount,
        '0x',
      ]);

    return {
      txRequest: {
        data: functionData,
        to: this.l2Network.tokenBridge.l2GatewayRouter,
        value: BigNumber.from(0),
        from: params.from,
      },
      // we make this async and expect a provider since we
      // in the future we want to do proper estimation here
      /* eslint-disable @typescript-eslint/no-unused-vars */
      estimateL1GasLimit: async (l1Provider: Provider) => {
        return BigNumber.from(160000);
      },
    };
  }

  /**
   * Withdraw tokens from L2 to L1
   * @param params
   * @returns
   */
  public async withdraw(
    params: (OmitTyped<Erc721WithdrawParams, 'from'> & { l2Signer: Signer }) | L2ToL1TxReqAndSigner
  ): Promise<L2ContractTransaction> {
    if (!SignerProviderUtils.signerHasProvider(params.l2Signer)) {
      throw new MissingProviderArbSdkError('l2Signer');
    }
    await this.checkL2Network(params.l2Signer);

    const withdrawalRequest = isL2ToL1TransactionRequest<
      OmitTyped<Erc721WithdrawParams, 'from'> & { l2Signer: Signer }
    >(params)
      ? params
      : await this.getWithdrawalRequest({
          ...params,
          from: await params.l2Signer.getAddress(),
        });

    const tx = await params.l2Signer.sendTransaction({
      ...withdrawalRequest.txRequest,
      ...params.overrides,
    });
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

    interface GasParams {
      maxSubmissionCost: BigNumber;
      gasLimit: BigNumber;
    }
    const from = await l1Signer.getAddress();
    const encodeFuncData = (setTokenGas: GasParams, setGatewayGas: GasParams, maxFeePerGas: BigNumber): any => {
      // if we set maxFeePerGas to be the error triggering param then it will
      // always trigger for the setToken call and never make it ti setGateways
      // so we here we just use the gas limit to trigger retryable data
      const doubleFeePerGas = maxFeePerGas.eq(RetryableDataTools.ErrorTriggeringParams.maxFeePerGas)
        ? RetryableDataTools.ErrorTriggeringParams.maxFeePerGas.mul(2)
        : maxFeePerGas;
      const setTokenDeposit = setTokenGas.gasLimit.mul(doubleFeePerGas).add(setTokenGas.maxSubmissionCost);
      const setGatewayDeposit = setGatewayGas.gasLimit.mul(doubleFeePerGas).add(setGatewayGas.maxSubmissionCost);

      const data = l1Token.interface.encodeFunctionData('registerTokenOnL2', [
        l2TokenAddress,
        setTokenGas.maxSubmissionCost,
        setGatewayGas.maxSubmissionCost,
        setTokenGas.gasLimit,
        setGatewayGas.gasLimit,
        doubleFeePerGas,
        setTokenDeposit,
        setGatewayDeposit,
        l1SenderAddress,
      ]);

      return {
        data,
        value: setTokenDeposit.add(setGatewayDeposit),
        to: l1Token.address,
        from,
      };
    };

    const l1Provider = l1Signer.provider;
    const gEstimator = new L1ToL2MessageGasEstimator(l2Provider);
    const setTokenEstimates2 = await gEstimator.populateFunctionParams(
      (params: OmitTyped<L1ToL2MessageGasParams, 'deposit'>) =>
        encodeFuncData(
          {
            gasLimit: params.gasLimit,
            maxSubmissionCost: params.maxSubmissionCost,
          },
          {
            gasLimit: RetryableDataTools.ErrorTriggeringParams.gasLimit,
            maxSubmissionCost: BigNumber.from(1),
          },
          params.maxFeePerGas
        ),
      l1Provider
    );

    const setGatewayEstimates2 = await gEstimator.populateFunctionParams(
      (params: OmitTyped<L1ToL2MessageGasParams, 'deposit'>) =>
        encodeFuncData(
          {
            gasLimit: setTokenEstimates2.estimates.gasLimit,
            maxSubmissionCost: setTokenEstimates2.estimates.maxSubmissionCost,
          },
          {
            gasLimit: params.gasLimit,
            maxSubmissionCost: params.maxSubmissionCost,
          },
          params.maxFeePerGas
        ),
      l1Provider
    );

    const registerTx = await l1Signer.sendTransaction({
      to: l1Token.address,
      data: setGatewayEstimates2.data,
      value: setGatewayEstimates2.value,
    });

    return L1TransactionReceipt.monkeyPatchWait(registerTx);
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
  ): Promise<Array<EventArgs<GatewaySetEvent>>> {
    await this.checkL1Network(l1Provider);

    const l1GatewayRouterAddress = this.l2Network.tokenBridge.l1GatewayRouter;
    const eventFetcher = new EventFetcher(l1Provider);
    return (
      await eventFetcher.getEvents(L1GatewayRouter__factory, (t) => t.filters.GatewaySet(), {
        ...filter,
        address: l1GatewayRouterAddress,
      })
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
  ): Promise<Array<EventArgs<GatewaySetEvent>>> {
    if (this.l2Network.isCustom && customNetworkL2GatewayRouter == null) {
      throw new ArbSdkError('Must supply customNetworkL2GatewayRouter for custom network ');
    }
    await this.checkL2Network(l2Provider);

    const l2GatewayRouterAddress = customNetworkL2GatewayRouter ?? this.l2Network.tokenBridge.l2GatewayRouter;

    const eventFetcher = new EventFetcher(l2Provider);
    return (
      await eventFetcher.getEvents(L1GatewayRouter__factory, (t) => t.filters.GatewaySet(), {
        ...filter,
        address: l2GatewayRouterAddress,
      })
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
    tokenGateways: TokenAndGateway[],
    options?: GasOverrides
  ): Promise<L1ContractCallTransaction> {
    if (!SignerProviderUtils.signerHasProvider(l1Signer)) {
      throw new MissingProviderArbSdkError('l1Signer');
    }
    await this.checkL1Network(l1Signer);
    await this.checkL2Network(l2Provider);

    const from = await l1Signer.getAddress();

    const l1GatewayRouter = L1GatewayRouter__factory.connect(this.l2Network.tokenBridge.l1GatewayRouter, l1Signer);

    const setGatewaysFunc = (params: OmitTyped<L1ToL2MessageGasParams, 'deposit'>): any => {
      return {
        data: l1GatewayRouter.interface.encodeFunctionData('setGateways', [
          tokenGateways.map((tG) => tG.tokenAddr),
          tokenGateways.map((tG) => tG.gatewayAddr),
          params.gasLimit,
          params.maxFeePerGas,
          params.maxSubmissionCost,
        ]),
        from,
        value: params.gasLimit.mul(params.maxFeePerGas).add(params.maxSubmissionCost),
        to: l1GatewayRouter.address,
      };
    };
    const gEstimator = new L1ToL2MessageGasEstimator(l2Provider);
    const estimates = await gEstimator.populateFunctionParams(setGatewaysFunc, l1Signer.provider, options);

    const res = await l1Signer.sendTransaction({
      to: estimates.to,
      data: estimates.data,
      value: estimates.estimates.deposit,
    });

    return L1TransactionReceipt.monkeyPatchContractCallWait(res);
  }
}
