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

import "./L2ArbitrumGateway.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/libraries/gateway/ICustomGateway.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract L2ERC721Gateway is L2ArbitrumGateway, ICustomGateway {
    // stores addresses of L2 tokens to be used
    mapping(address => address) public override l1ToL2Token;

    function initialize(address _l1Counterpart, address _router) public {
        L2ArbitrumGateway._initialize(_l1Counterpart, _router);
    }

    /**
     * @notice internal utility function used to handle when no contract is deployed at expected address
     */
    function handleNoContract(
        address,
        address, /* expectedL2Address */
        address,
        address, /* _to */
        uint256,
        bytes memory /* gatewayData */
    ) internal override returns (bool shouldHalt) {
        return true;
    }

    /**
     * @notice Calculate the address used when bridging an ERC721 token
     * @dev the L1 and L2 address oracles may not always be in sync.
     * For example, a custom token may have been registered but not deploy or the contract self destructed.
     * @param l1Token address of L1 token
     * @return L2 address of a bridged ERC721 token
     */
    function calculateL2TokenAddress(address l1Token) public view override returns (address) {
        return l1ToL2Token[l1Token];
    }

    function registerTokenFromL1(address[] calldata l1Address, address[] calldata l2Address) external onlyCounterpartGateway {
        // we assume both arrays are the same length, safe since its encoded by the L1
        for (uint256 i = 0; i < l1Address.length; i++) {
            // here we don't check if l2Address is a contract and instead deal with that behaviour
            // in `handleNoContract` this way we keep the l1 and l2 address oracles in sync
            l1ToL2Token[l1Address[i]] = l2Address[i];
            emit TokenSet(l1Address[i], l2Address[i]);
        }
    }
}
