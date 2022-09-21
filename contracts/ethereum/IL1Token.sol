/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2020, Offchain Labs, Inc.
 * Modifications Copyright 2022, chicunic
 */

pragma solidity ^0.8.0;

interface IL1Token {
    /// @notice should return `0xa4b1` if token is enabled for arbitrum gateways
    function isArbitrumEnabled() external view returns (uint8);

    /**
     * @notice Should make an external call to EthERC20Bridge.registerCustomL2Token
     */
    function registerTokenOnL2(
        address l2CustomTokenAddress,
        uint256 maxSubmissionCostForCustomBridge,
        uint256 maxSubmissionCostForRouter,
        uint256 maxGasForCustomBridge,
        uint256 maxGasForRouter,
        uint256 gasPriceBid,
        uint256 valueForGateway,
        uint256 valueForRouter,
        address creditBackAddress
    ) external payable;

    function bridgeMint(
        address account,
        uint256 amount,
        bytes calldata tokendata
    ) external;

    function bridgeBurn(
        address account,
        uint256 amount,
        bytes calldata tokendata
    ) external;
}
