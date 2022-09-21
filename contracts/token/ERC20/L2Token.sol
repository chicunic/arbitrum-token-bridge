// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "../../arbitrum/IL2Token.sol";

contract L2Token is ERC20, ERC20Burnable, IL2Token {
    address public l2Gateway;
    address public override l1Address;

    constructor(address _l2Gateway, address _l1TokenAddress) ERC20("L2FT", "L2FT") {
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
        bytes calldata /* tokendata */
    ) external override onlyL2Gateway {
        _mint(account, amount);
    }

    function bridgeBurn(
        address account,
        uint256 amount,
        bytes calldata /* tokendata */
    ) external override onlyL2Gateway {
        burnFrom(account, amount);
    }
}
