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

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-0.8/token/ERC721/ERC721.sol";

interface IArbToken {
    /**
     * @notice should increase token supply by amount, and should (probably) only be callable by the L1 bridge.
     */
    function bridgeMint(address account, uint256 tokenId) external;

    /**
     * @notice should decrease token supply by amount, and should (probably) only be callable by the L1 bridge.
     */
    function bridgeBurn(address account, uint256 tokenId) external;

    /**
     * @return address of layer 1 token
     */
    function l1Address() external view returns (address);
}

contract L2Token is ERC721, IArbToken {
    address public l2Gateway;
    address public override l1Address;

    constructor(address _l2Gateway, address _l1TokenAddress) ERC721("L2NFT", "L2NFT") {
        l2Gateway = _l2Gateway;
        l1Address = _l1TokenAddress;
    }

    function getChainId() public view returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }

    modifier onlyL2Gateway() {
        require(msg.sender == l2Gateway, "NOT_GATEWAY");
        _;
    }

    function bridgeMint(address account, uint256 tokenId) external override onlyL2Gateway {
        _mint(account, tokenId);
    }

    function bridgeBurn(address account, uint256 tokenId) external override onlyL2Gateway {
        _beforeTokenTransfer(account, address(0), tokenId);

        _burn(tokenId);
    }
}
