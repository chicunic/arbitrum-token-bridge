require('dotenv').config();
const { providers, Wallet } = require('ethers');
const { ethers } = require('hardhat');
const Bridge = require('../utils/Bridge');
const getNetworks = require('../utils/getNetworks');

const l1Provider = new providers.JsonRpcProvider(process.env.L1_RPC);
const l2Provider = new providers.JsonRpcProvider(process.env.L2_RPC);

const l1Signer = new Wallet(process.env.L1_PRIVKEY, l1Provider);
const l2Signer = new Wallet(process.env.L2_PRIVKEY, l2Provider);

async function main() {
  const { l1Network, l2Network } = await getNetworks(l1Signer, l2Signer);
  const bridge = await Bridge.init(l1Signer, l2Signer, { isCustomNetwork: { l1Network, l2Network } });

  const l1SignerAddress = await l1Signer.getAddress();
  const inboxAddress = (await bridge.l1Bridge.getInbox()).address;

  console.log('2 - Deploy CustomGateway');
  // 1. deploy L1 ERC20 Gateway
  const L1CustomGateway = (await ethers.getContractFactory('L1CustomGateway')).connect(l1Signer);
  const l1CustomGatewayLogic = await L1CustomGateway.deploy();
  await l1CustomGatewayLogic.deployed();
  console.log('1-1: L1 CustomGateway Logic deployed at', l1CustomGatewayLogic.address);

  const L1TransparentUpgradeableProxy = (
    await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy')
  ).connect(l1Signer);
  const l1CustomGatewayProxy = await L1TransparentUpgradeableProxy.deploy(l1CustomGatewayLogic.address, l1Network.tokenBridge.l1ProxyAdmin, '0x');
  await l1CustomGatewayProxy.deployed();
  console.log('1-2: L1 CustomGateway Proxy deployed at', l1CustomGatewayProxy.address);

  // 2. deploy L2 ERC20 Gateway
  const L2CustomGateway = (await ethers.getContractFactory('L2CustomGateway')).connect(l2Signer);
  const l2CustomGatewayLogic = await L2CustomGateway.deploy();
  await l2CustomGatewayLogic.deployed();
  console.log('2-1: L2 CustomGateway Logic deployed at', l2CustomGatewayLogic.address);

  const L2TransparentUpgradeableProxy = (
    await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy')
  ).connect(l2Signer);
  const l2CustomGatewayProxy = await L2TransparentUpgradeableProxy.deploy(l2CustomGatewayLogic.address, l1Network.tokenBridge.l2ProxyAdmin, '0x');
  await l2CustomGatewayProxy.deployed();
  console.log('2-2: L2 CustomGateway Proxy deployed at', l2CustomGatewayProxy.address);

  // 3. init gateway
  const l1CustomGateway = L1CustomGateway.attach(l1CustomGatewayProxy.address);
  const initL1Bridge = await l1CustomGateway.initialize(
    l2CustomGatewayProxy.address,
    l1Network.tokenBridge.l1GatewayRouter,
    inboxAddress,
    l1SignerAddress,
  );
  await initL1Bridge.wait();
  console.log('3-1: init L1 CustomGateway hash', initL1Bridge.hash);

  const l2CustomGateway = L2CustomGateway.attach(l2CustomGatewayProxy.address);
  const initL2Bridge = await l2CustomGateway.initialize(
    l1CustomGatewayProxy.address,
    l1Network.tokenBridge.l2GatewayRouter,
  );
  await initL2Bridge.wait();
  console.log('3-2: init L2 CustomGateway hash', initL2Bridge.hash);

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
