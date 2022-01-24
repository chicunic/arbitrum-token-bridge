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

  console.log('3 - Deploy and register ERC20');
  const premine = '1000000000000000000';

  // 1. deploy ERC20
  const L1Token = await ethers.getContractFactory('L1Token');
  const l1Token = await L1Token.connect(l1Signer).deploy(premine);
  await l1Token.deployed();
  console.log('1-1: L1 ERC20 deployed to:', l1Token.address);

  const L2Token = await ethers.getContractFactory('L2Token');
  const l2Token = await L2Token.connect(l2Signer).deploy(l1Network.tokenBridge.l2CustomGateway, l1Token.address);
  await l2Token.deployed();
  console.log('1-2: L2 ERC20 deployed to:', l2Token.address);

  // 2. register tokens on bridge
  const maxGas = 4000000;
  const gasPriceBid = (await l2Signer.getGasPrice()).mul(2);
  const maxSubmissionCost = 400000000000;

  const l1CustomGateway = await ethers.getContractAt('L1CustomGateway', l1Network.tokenBridge.l1CustomGateway, l1Signer);
  const l1SetTx = await l1CustomGateway.forceRegisterTokenToL2(
    [l1Token.address],
    [l2Token.address],
    maxGas,
    gasPriceBid,
    maxSubmissionCost,
    {
      value: gasPriceBid.mul(maxGas).add(maxSubmissionCost),
      gasPrice: 30000000000,
    },
  );
  await l1SetTx.wait();
  console.log('2-1: Set L1 CustomGateway hash', l1SetTx.hash);

  const l1GatewayRouter = await ethers.getContractAt('L1GatewayRouter', l1Network.tokenBridge.l1GatewayRouter, l1Signer);
  const setGatewayTx = await l1GatewayRouter.setGateways(
    [l1Token.address],
    [l1Network.tokenBridge.l1CustomGateway],
    maxGas,
    gasPriceBid,
    maxSubmissionCost,
    {
      value: gasPriceBid.mul(maxGas).add(maxSubmissionCost),
      gasPrice: 30000000000,
    },
  );
  await setGatewayTx.wait();
  console.log('2-2: Set L1 GatewayRouter hash', setGatewayTx.hash);

  console.log('Done');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
