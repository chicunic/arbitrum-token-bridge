// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "../../ethereum/IL1Token.sol";

interface IL1CustomGateway {
    function registerTokenToL2(
        address _l2Address,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost,
        address _creditBackAddress
    ) external payable returns (uint256);
}

interface IGatewayRouter2 {
    function setGateway(
        address _gateway,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost,
        address _creditBackAddress
    ) external payable returns (uint256);
}

contract L1Token is Ownable, ERC721, ERC721Burnable, IL1Token {
    address public bridge;
    address public router;
    bool private shouldRegisterGateway;

    constructor(address _bridge, address _router) ERC721("L1NFT", "L1NFT") {
        bridge = _bridge;
        router = _router;
    }

    modifier onlyL1Gateway() {
        require(msg.sender == bridge, "NOT_GATEWAY");
        _;
    }

    function mint(address to, uint256 tokenId) external onlyOwner {
        _mint(to, tokenId);
    }

    function mint(address to, uint256[] calldata tokenIds) external onlyOwner {
        for (uint8 i = 0; i < tokenIds.length; ++i) {
            _mint(to, tokenIds[i]);
        }
    }

    function isArbitrumEnabled() external pure override returns (uint8) {
        return uint8(0xa4b1 % 256);
    }

    function registerTokenOnL2(
        address l2CustomTokenAddress,
        uint256 maxSubmissionCostForCustomBridge,
        uint256 maxSubmissionCostForRouter,
        uint256 maxGasForCustomBridge,
        uint256 maxGasForRouter,
        uint256 gasPriceBid,
        uint256 valueForGateway,
        uint256 valueForRouter,
        address creditBackAddress
    ) public payable override onlyOwner {
        // we temporarily set `shouldRegisterGateway` to true for the callback in registerTokenToL2 to succeed
        bool prev = shouldRegisterGateway;
        shouldRegisterGateway = true;

        IL1CustomGateway(bridge).registerTokenToL2{value: valueForGateway}(
            l2CustomTokenAddress,
            maxGasForCustomBridge,
            gasPriceBid,
            maxSubmissionCostForCustomBridge,
            creditBackAddress
        );

        IGatewayRouter2(router).setGateway{value: valueForRouter}(
            bridge,
            maxGasForRouter,
            gasPriceBid,
            maxSubmissionCostForRouter,
            creditBackAddress
        );

        shouldRegisterGateway = prev;
    }

    function bridgeMint(
        address account,
        uint256 amount,
        bytes calldata tokendata
    ) public override onlyL1Gateway {
        uint256[] memory tokenIds = abi.decode(tokendata, (uint256[]));
        for (uint8 i = 0; i < amount; ++i) {
            _mint(account, tokenIds[i]);
        }
    }

    function bridgeBurn(
        address, /* account */
        uint256 amount,
        bytes calldata tokendata
    ) external override onlyL1Gateway {
        uint256[] memory tokenIds = abi.decode(tokendata, (uint256[]));
        for (uint8 i = 0; i < amount; ++i) {
            burn(tokenIds[i]);
        }
    }
}
