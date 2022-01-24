require('dotenv').config();
const { constants, providers, Wallet } = require('ethers');
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

  console.log('1 - Deploy GatewayRouter');
  // deploy L1 contracts
  const L1GatewayRouter = (await ethers.getContractFactory('L1GatewayRouter')).connect(l1Signer);
  const l1GatewayRouterLogic = await L1GatewayRouter.deploy();
  await l1GatewayRouterLogic.deployed();
  console.log('1-1: L1 GatewayRouter Logic deployed at', l1GatewayRouterLogic.address);

  const L1ProxyAdmin = (await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/ProxyAdmin.sol:ProxyAdmin')).connect(l1Signer);
  const l1ProxyAdmin = await L1ProxyAdmin.deploy();
  await l1ProxyAdmin.deployed();
  console.log('1-2: L1 ProxyAdmin deployed at', l1ProxyAdmin.address);

  const L1TransparentUpgradeableProxy = (
    await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy')
  ).connect(l1Signer);
  const l1GatewayRouterProxy = await L1TransparentUpgradeableProxy.deploy(l1GatewayRouterLogic.address, l1ProxyAdmin.address, '0x');
  await l1GatewayRouterProxy.deployed();
  console.log('1-3: L1 GatewayRouter Proxy deployed at', l1GatewayRouterProxy.address);

  // deploy L2 contracts
  const L2GatewayRouter = (await ethers.getContractFactory('L2GatewayRouter')).connect(l2Signer);
  const l2GatewayRouterLogic = await L2GatewayRouter.deploy();
  await l2GatewayRouterLogic.deployed();
  console.log('2-1: L2 GatewayRouter Logic deployed at', l2GatewayRouterLogic.address);

  const L2ProxyAdmin = (await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/ProxyAdmin.sol:ProxyAdmin')).connect(l2Signer);
  const l2ProxyAdmin = await L2ProxyAdmin.deploy();
  await l2ProxyAdmin.deployed();
  console.log('2-2: L2 ProxyAdmin deployed at', l2ProxyAdmin.address);

  const L2TransparentUpgradeableProxy = (
    await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy')
  ).connect(l2Signer);
  const l2GatewayRouterProxy = await L2TransparentUpgradeableProxy.deploy(l2GatewayRouterLogic.address, l2ProxyAdmin.address, '0x');
  await l2GatewayRouterProxy.deployed();
  console.log('2-3: L2 GatewayRouter Proxy deployed at', l2GatewayRouterProxy.address);

  // init L1 gateway
  const l1GatewayRouter = L1GatewayRouter.attach(l1GatewayRouterProxy.address);
  const initL1RouterTx = await l1GatewayRouter.initialize(
    l1SignerAddress,
    constants.AddressZero, // l1DefaultGateway
    constants.AddressZero, // whitelistAddress
    l2GatewayRouterProxy.address,
    inboxAddress,
  );
  await initL1RouterTx.wait();
  console.log('3-1: init L1 GatewayRouter hash', initL1RouterTx.hash);

  // init L2 gateway
  const l2GatewayRouter = L2GatewayRouter.attach(l2GatewayRouterProxy.address);
  const initL2Router = await l2GatewayRouter.initialize(
    l1GatewayRouterProxy.address,
    constants.AddressZero, // l2DefaultGateway
  );
  await initL2Router.wait();
  console.log('3-2: init L2 GatewayRouter hash', initL2Router.hash);

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
