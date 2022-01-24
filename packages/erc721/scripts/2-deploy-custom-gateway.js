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

  console.log('2 - Deploy ERC721Gateway');
  // 1. deploy ERC721 Gateway
  const L1ERC721Gateway = (await ethers.getContractFactory('L1ERC721Gateway')).connect(l1Signer);
  const l1ERC721GatewayLogic = await L1ERC721Gateway.deploy();
  await l1ERC721GatewayLogic.deployed();
  console.log('1-1: L1 ERC721Gateway Logic deployed at', l1ERC721GatewayLogic.address);

  const L1TransparentUpgradeableProxy = (
    await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy')
  ).connect(l1Signer);
  const l1ERC721GatewayProxy = await L1TransparentUpgradeableProxy.deploy(l1ERC721GatewayLogic.address, l1Network.tokenBridge.l1ProxyAdmin, '0x');
  await l1ERC721GatewayProxy.deployed();
  console.log('1-2: L1 ERC721Gateway Proxy deployed at', l1ERC721GatewayProxy.address);

  const L2ERC721Gateway = (await ethers.getContractFactory('L2ERC721Gateway')).connect(l2Signer);
  const l2ERC721GatewayLogic = await L2ERC721Gateway.deploy();
  await l2ERC721GatewayLogic.deployed();
  console.log('2-1: L2 ERC721Gateway Logic deployed at', l2ERC721GatewayLogic.address);

  const L2TransparentUpgradeableProxy = (
    await ethers.getContractFactory('@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy')
  ).connect(l2Signer);
  const l2ERC721GatewayProxy = await L2TransparentUpgradeableProxy.deploy(l2ERC721GatewayLogic.address, l1Network.tokenBridge.l2ProxyAdmin, '0x');
  await l2ERC721GatewayProxy.deployed();
  console.log('2-2: L2 ERC721Gateway Proxy deployed at', l2ERC721GatewayProxy.address);

  // 4. init
  const l1ERC721Gateway = L1ERC721Gateway.attach(l1ERC721GatewayProxy.address);
  const initL1Bridge = await l1ERC721Gateway.initialize(
    l2ERC721GatewayProxy.address,
    l1Network.tokenBridge.l1GatewayRouter,
    inboxAddress,
    l1SignerAddress,
  );
  await initL1Bridge.wait();
  console.log('4-1: init L1 ERC721Gateway hash', initL1Bridge.hash);

  const l2CustomGateway = L2ERC721Gateway.attach(l2ERC721GatewayProxy.address);
  const initL2Bridge = await l2CustomGateway.initialize(
    l1ERC721GatewayProxy.address,
    l1Network.tokenBridge.l2GatewayRouter,
  );
  await initL2Bridge.wait();
  console.log('4-2: init L2 ERC721Gateway hash', initL2Bridge.hash);

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
