// SPDX-License-Identifier: Apache-2.0

/*
 * Copyright 2020, Offchain Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

pragma solidity ^0.6.11;

import "@openzeppelin/contracts/utils/Address.sol";
import "arb-bridge-eth/contracts/libraries/BytesLib.sol";
import "arb-bridge-eth/contracts/libraries/ProxyUtil.sol";
import "arb-bridge-eth/contracts/libraries/AddressAliasHelper.sol";

import "arb-bridge-peripherals/contracts/tokenbridge/arbitrum/IArbToken.sol";

import "arb-bridge-peripherals/contracts/tokenbridge/arbitrum/L2ArbitrumMessenger.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/libraries/gateway/GatewayMessageHandler.sol";
import "../../libraries/gateway/TokenGateway.sol";

/**
 * @title Common interface for gatways on Arbitrum messaging to L1.
 */
abstract contract L2ArbitrumGateway is L2ArbitrumMessenger, TokenGateway {
    using Address for address;

    uint256 public exitNum;

    event DepositFinalized(address indexed l1Token, address indexed _from, address indexed _to, uint256 _tokenId);

    event WithdrawalInitiated(address l1Token, address indexed _from, address indexed _to, uint256 indexed _l2ToL1Id, uint256 _exitNum, uint256 _tokenId);

    modifier onlyCounterpartGateway() override {
        require(msg.sender == counterpartGateway || AddressAliasHelper.undoL1ToL2Alias(msg.sender) == counterpartGateway, "ONLY_COUNTERPART_GATEWAY");
        _;
    }

    function postUpgradeInit() external view {
        // it is assumed the L2 Arbitrum Gateway contract is behind a Proxy controlled by a proxy admin
        // this function can only be called by the proxy admin contract
        address proxyAdmin = ProxyUtil.getProxyAdmin();
        require(msg.sender == proxyAdmin, "NOT_FROM_ADMIN");
        // this has no other logic since the current upgrade doesn't require this logic
    }

    function _initialize(address _l1Counterpart, address _router) internal virtual override {
        TokenGateway._initialize(_l1Counterpart, _router);
        // L1 gateway must have a router
        require(_router != address(0), "BAD_ROUTER");
    }

    function createOutboundTx(
        address _from,
        uint256, /* _tokenId */
        bytes memory _outboundCalldata
    ) internal virtual returns (uint256) {
        // We make this function virtual since outboundTransfer logic is the same for many gateways
        // but sometimes (ie weth) you construct the outgoing message differently.

        // exitNum incremented after being included in _outboundCalldata
        exitNum++;
        return
            sendTxToL1(
                // default to sending no callvalue to the L1
                0,
                _from,
                counterpartGateway,
                _outboundCalldata
            );
    }

    function getOutboundCalldata(
        address _token,
        address _from,
        address _to,
        uint256 _tokenId,
        bytes memory _data
    ) public view override returns (bytes memory outboundCalldata) {
        outboundCalldata = abi.encodeWithSelector(
            TokenGateway.finalizeInboundTransfer.selector,
            _token,
            _from,
            _to,
            _tokenId,
            GatewayMessageHandler.encodeFromL2GatewayMsg(exitNum, _data)
        );

        return outboundCalldata;
    }

    function outboundTransfer(
        address _l1Token,
        address _to,
        uint256 _tokenId,
        bytes calldata _data
    ) public payable virtual returns (bytes memory) {
        return outboundTransfer(_l1Token, _to, _tokenId, 0, 0, _data);
    }

    function outboundTransfer(
        address,
        address,
        uint256 _tokenId,
        uint256, /* _maxGas */
        uint256, /* _gasPriceBid */
        bytes calldata
    ) public payable virtual override returns (bytes memory res) {
        // This function is set as public and virtual so that subclasses can override
        // it and add custom validation for callers (ie only whitelisted users)
        // the function is marked as payable to conform to the inheritance setup
        // this particular code path shouldn't have a msg.value > 0
        // TODO: remove this invariant for execution markets
        // require(msg.value == 0, "NO_VALUE");
        // address _from;
        // bytes memory _extraData;
        // {
        //     if (isRouter(msg.sender)) {
        //         (_from, _extraData) = GatewayMessageHandler.parseFromRouterToGateway(_data);
        //     } else {
        //         _from = msg.sender;
        //         _extraData = _data;
        //     }
        // }
        // the inboundEscrowAndCall functionality has been disabled, so no data is allowed
        // require(_extraData.length == 0, "EXTRA_DATA_DISABLED");
        // uint256 id;
        // {
        //     address l2Token = calculateL2TokenAddress(_l1Token);
        //     require(l2Token.isContract(), "TOKEN_NOT_DEPLOYED");
        //     require(IArbToken(l2Token).l1Address() == _l1Token, "NOT_EXPECTED_L1_TOKEN");
        //     _tokenId = outboundEscrowTransfer(l2Token, _from, _tokenId);
        //     id = triggerWithdrawal(_l1Token, _from, _to, _tokenId, _extraData);
        // }
        return abi.encode(_tokenId);
    }

    function triggerWithdrawal(
        address,
        address,
        address,
        uint256 _tokenId,
        bytes memory
    ) internal returns (uint256) {
        // exit number used for tradeable exits
        // uint256 currExitNum = exitNum;
        // unique id used to identify the L2 to L1 tx
        // uint256 id = createOutboundTx(_from, _tokenId, getOutboundCalldata(_l1Token, _from, _to, _tokenId, _data));
        // emit WithdrawalInitiated(_l1Token, _from, _to, id, currExitNum, _tokenId);
        // return id;
        return _tokenId;
    }

    function outboundEscrowTransfer(
        address,
        address,
        uint256 _tokenId
    ) internal virtual returns (uint256 tokenIdBurnt) {
        // this method is virtual since different subclasses can handle escrow differently
        // user funds are escrowed on the gateway using this function
        // burns L2 tokens in order to release escrowed L1 tokens
        // IArbToken(_l2Token).bridgeBurn(_from, _tokenId);
        // by default we assume that the tokenId we send to bridgeBurn is the tokenId burnt
        // this might not be the case for every token
        return _tokenId;
    }

    function inboundEscrowTransfer(
        address _l2Address,
        address _dest,
        uint256 _tokenId
    ) internal virtual {
        // this method is virtual since different subclasses can handle escrow differently
        IArbToken(_l2Address).bridgeMint(_dest, _tokenId);
    }

    /**
     * @notice Mint on L2 upon L1 deposit.
     * If token not yet deployed and symbol/name/decimal data is included, deploys StandardArbERC20
     * @dev Callable only by the L1ERC20Gateway.outboundTransfer method. For initial deployments of a token the L1 L1ERC20Gateway
     * is expected to include the deployData. If not a L1 withdrawal is automatically triggered for the user
     * @param _token L1 address of ERC20
     * @param _from account that initiated the deposit in the L1
     * @param _to account to be credited with the tokens in the L2 (can be the user's L2 account or a contract)
     * @param _tokenId token id to be minted to the user
     * @param _data encoded symbol/name/decimal data for deploy, in addition to any additional callhook data
     */
    function finalizeInboundTransfer(
        address _token,
        address _from,
        address _to,
        uint256 _tokenId,
        bytes calldata _data
    ) external payable override onlyCounterpartGateway {
        (bytes memory gatewayData, bytes memory callHookData) = GatewayMessageHandler.parseFromL1GatewayMsg(_data);

        if (callHookData.length != 0) {
            // callHookData should always be 0 since inboundEscrowAndCall is disabled
            callHookData = bytes("");
        }

        address expectedAddress = calculateL2TokenAddress(_token);

        if (!expectedAddress.isContract()) {
            bool shouldHalt = handleNoContract(_token, expectedAddress, _from, _to, _tokenId, gatewayData);
            if (shouldHalt) return;
        }
        // ignores gatewayData if token already deployed

        {
            // validate if L1 address supplied matches that of the expected L2 address
            (bool success, bytes memory _l1AddressData) = expectedAddress.staticcall(abi.encodeWithSelector(IArbToken.l1Address.selector));

            bool shouldWithdraw;
            if (!success || _l1AddressData.length < 32) {
                shouldWithdraw = true;
            } else {
                // we do this in the else branch since we want to avoid reverts
                // and `toAddress` reverts if _l1AddressData has a short length
                // `_l1AddressData` should be 12 bytes of padding then 20 bytes for the address
                address expectedL1Address = BytesLib.toAddress(_l1AddressData, 12);
                if (expectedL1Address != _token) {
                    shouldWithdraw = true;
                }
            }

            if (shouldWithdraw) {
                // we don't need the return value from triggerWithdrawal since this is forcing
                // a withdrawal back to the L1 instead of composing with a L2 dapp
                triggerWithdrawal(_token, address(this), _from, _tokenId, "");
                return;
            }
        }

        inboundEscrowTransfer(expectedAddress, _to, _tokenId);
        emit DepositFinalized(_token, _from, _to, _tokenId);

        return;
    }

    // returns if function should halt after
    function handleNoContract(
        address _l1Token,
        address expectedL2Address,
        address _from,
        address _to,
        uint256 _tokenId,
        bytes memory gatewayData
    ) internal virtual returns (bool shouldHalt);
}
