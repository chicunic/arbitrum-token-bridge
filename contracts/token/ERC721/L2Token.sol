// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "../../arbitrum/IL2Token.sol";

contract L2Token is ERC721, ERC721Burnable, IL2Token {
    address public l2Gateway;
    address public override l1Address;

    constructor(address _l2Gateway, address _l1TokenAddress) ERC721("L2NFT", "L2NFT") {
        l2Gateway = _l2Gateway;
        l1Address = _l1TokenAddress;
    }

    modifier onlyL2Gateway() {
        require(msg.sender == l2Gateway, "NOT_GATEWAY");
        _;
    }

    function bridgeMint(
        address account,
        uint256 amount,
        bytes calldata tokendata
    ) external override onlyL2Gateway {
        uint256[] memory tokenIds = abi.decode(tokendata, (uint256[]));
        for (uint8 i = 0; i < amount; ++i) {
            _mint(account, tokenIds[i]);
        }
    }

    function bridgeBurn(
        address, /* account */
        uint256 amount,
        bytes calldata tokendata
    ) external override onlyL2Gateway {
        uint256[] memory tokenIds = abi.decode(tokendata, (uint256[]));
        for (uint8 i = 0; i < amount; ++i) {
            burn(tokenIds[i]);
        }
    }
}
