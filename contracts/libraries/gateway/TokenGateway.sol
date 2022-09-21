/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2020, Offchain Labs, Inc.
 * Modifications Copyright 2022, chicunic
 */

pragma solidity ^0.8.0;

import "./ITokenGateway.sol";

import "@openzeppelin/contracts/utils/Address.sol";

abstract contract TokenGateway is ITokenGateway {
    using Address for address;

    address public counterpartGateway;
    address public router;

    // This modifier is overriden in gateways to validate the message sender
    // For L1 to L2 messages need to be validated against the aliased counterpartGateway
    // For L2 to L1 messages need to be validated against the bridge and L2ToL1Sender
    // prettier-ignore

    function _initialize(address _counterpartGateway, address _router) internal virtual {
        // This initializes internal variables of the abstract contract it can be chained together with other functions.
        // It is virtual so subclasses can override or wrap around this logic.
        // An example where this is useful is different subclasses that validate the router address differently
        require(_counterpartGateway != address(0), "INVALID_COUNTERPART");
        require(counterpartGateway == address(0), "ALREADY_INIT");
        counterpartGateway = _counterpartGateway;
        router = _router;
    }

    function isRouter(address _target) internal view returns (bool isTargetRouter) {
        return _target == router;
    }

    /**
     * @notice Calculate the address used when bridging an ERC20 token
     * @dev the L1 and L2 address oracles may not always be in sync.
     * For example, a custom token may have been registered but not deploy or the contract self destructed.
     * @param l1ERC20 address of L1 token
     * @return L2 address of a bridged ERC20 token
     */
    function calculateL2TokenAddress(address l1ERC20) public view virtual override returns (address);
}
