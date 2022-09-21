// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IL2Token {
    /**
     * @notice should increase token supply by amount, and should (probably) only be callable by the L1 bridge.
     */
    function bridgeMint(
        address account,
        uint256 amount,
        bytes calldata tokendata
    ) external;

    /**
     * @notice should decrease token supply by amount, and should (probably) only be callable by the L1 bridge.
     */
    function bridgeBurn(
        address account,
        uint256 amount,
        bytes calldata tokendata
    ) external;

    /**
     * @return address of layer 1 token
     */
    function l1Address() external view returns (address);
}
