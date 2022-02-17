// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-0.8/access/Ownable.sol";
import "@openzeppelin/contracts-0.8/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-0.8/token/ERC721/extensions/ERC721Burnable.sol";

contract L1Token is Ownable, ERC721, ERC721Burnable {
    constructor() ERC721("L1NFT", "L1NFT") {}

    function mint(address to, uint256 tokenId) external onlyOwner {
        _mint(to, tokenId);
    }

    function mint(address to, uint256[] calldata tokenIds) external onlyOwner {
        for (uint8 i = 0; i < tokenIds.length; ++i) {
            _mint(to, tokenIds[i]);
        }
    }
}
