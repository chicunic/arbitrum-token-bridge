/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2020, Offchain Labs, Inc.
 * Modifications Copyright 2022, chicunic
 */

pragma solidity ^0.8.0;

interface IMessageProvider {
    event InboxMessageDelivered(uint256 indexed messageNum, bytes data);

    event InboxMessageDeliveredFromOrigin(uint256 indexed messageNum);
}
