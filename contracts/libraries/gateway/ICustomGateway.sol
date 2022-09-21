/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2020, Offchain Labs, Inc.
 * Modifications Copyright 2022, chicunic
 */

pragma solidity ^0.8.0;

// import "./ITokenGateway.sol";

interface ICustomGateway {
    function l1ToL2Token(address _l1Token) external view returns (address _l2Token);

    event TokenSet(address indexed l1Address, address indexed l2Address);
}
