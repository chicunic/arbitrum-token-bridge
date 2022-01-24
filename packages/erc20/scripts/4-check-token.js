require('dotenv').config();
const { providers, Wallet } = require('ethers');
const { ethers } = require('hardhat');
const getNetworks = require('../utils/getNetworks');

const l1Provider = new providers.JsonRpcProvider(process.env.L1_RPC);
const l2Provider = new providers.JsonRpcProvider(process.env.L2_RPC);

const l1Signer = new Wallet(process.env.L1_PRIVKEY, l1Provider);
const l2Signer = new Wallet(process.env.L2_PRIVKEY, l2Provider);

async function main() {
  const { l1Network } = await getNetworks(l1Signer, l2Signer);

  console.log('4 - Check ERC20 registration');
  const token1 = process.env.L1_ERC20;
  const token2 = process.env.L2_ERC20;

  // 2. check CustomGateway
  const l1CustomGateway = await ethers.getContractAt('L1CustomGateway', l1Network.tokenBridge.l1CustomGateway, l1Signer);
  const l2CustomGateway = await ethers.getContractAt('L2CustomGateway', l1Network.tokenBridge.l2CustomGateway, l2Signer);

  {
    const l2TokenAddress = await l1CustomGateway.calculateL2TokenAddress(token1);
    console.log('Original L2 ', token2);
    console.log('Calculate L2', l2TokenAddress);
  }

  {
    const l2TokenAddress = await l2CustomGateway.calculateL2TokenAddress(token1);
    console.log('Original L2 ', token2);
    console.log('Calculate L2', l2TokenAddress);
  }

  // 3. check GatwayRouter
  const l1GatewayRouter = await ethers.getContractAt('L1GatewayRouter', l1Network.tokenBridge.l1GatewayRouter, l1Signer);
  const l2GatewayRouter = await ethers.getContractAt('L2GatewayRouter', l1Network.tokenBridge.l2GatewayRouter, l2Signer);
  {
    const gateway = await l1GatewayRouter.getGateway(token1);
    console.log('Original Gateway ', l1Network.tokenBridge.l1CustomGateway);
    console.log('Calculate Gateway', gateway);

    const token22 = await l1GatewayRouter.calculateL2TokenAddress(token1);
    console.log('Original L2 ', token2);
    console.log('Calculate L2', token22);
  }

  {
    const gateway = await l2GatewayRouter.getGateway(token1);
    console.log('Original Gateway ', l1Network.tokenBridge.l2CustomGateway);
    console.log('Calculate Gateway', gateway);

    const token22 = await l2GatewayRouter.calculateL2TokenAddress(token1);
    console.log('Original L2 ', token2);
    console.log('Calculate L2', token22);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
