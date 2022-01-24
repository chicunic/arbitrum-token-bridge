// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-0.8/token/ERC20/ERC20.sol";

contract L1Token is ERC20 {
    constructor(uint256 amount) ERC20("L1CustomToken", "L1CT") {
        _mint(_msgSender(), amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return 0;
    }
}
