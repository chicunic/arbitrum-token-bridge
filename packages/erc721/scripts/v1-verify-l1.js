require('dotenv').config();
const { providers, Wallet } = require('ethers');
const { ethers, run } = require('hardhat');
const getNetworks = require('../utils/getNetworks');

// const l1Provider = new providers.JsonRpcProvider(process.env.L1_RPC);
const l1Provider = ethers.provider;
const l2Provider = new providers.JsonRpcProvider(process.env.L2_RPC);

const l1Signer = new Wallet(process.env.L1_PRIVKEY, l1Provider);
const l2Signer = new Wallet(process.env.L2_PRIVKEY, l2Provider);

async function main() {
  const { l1Network } = await getNetworks(l1Signer, l2Signer);

  console.log('1 - Verify L1 GatewayRouter');
  const l1GatewayRouterLogic = await ethers.getContractAt(
    'L1GatewayRouter',
    l1Network.tokenBridge.l1GatewayRouterLogic,
  );
  try {
    await run('verify:verify', {
      address: l1GatewayRouterLogic.address,
      constructorArguments: [],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('1-1: L1 GatewayRouter Logic verified at', l1GatewayRouterLogic.address);

  const l1ProxyAdmin = await ethers.getContractAt(
    '@openzeppelin/contracts-0.8/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    l1Network.tokenBridge.l1ProxyAdmin,
  );
  try {
    await run('verify:verify', {
      address: l1ProxyAdmin.address,
      constructorArguments: [],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('1-2: L1 ProxyAdmin verified at', l1ProxyAdmin.address);

  const l1TransparentUpgradeableProxy = await ethers.getContractAt(
    '@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    l1Network.tokenBridge.l1GatewayRouter,
  );
  try {
    await run('verify:verify', {
      address: l1TransparentUpgradeableProxy.address,
      constructorArguments: [l1GatewayRouterLogic.address, l1ProxyAdmin.address, '0x'],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('1-3: L1 GatewayRouter Proxy verified at', l1TransparentUpgradeableProxy.address);

  const l1ERC721GatewayLogic = await ethers.getContractAt(
    'L1ERC721Gateway',
    l1Network.tokenBridge.l1CustomGatewayLogic,
  );
  try {
    await run('verify:verify', {
      address: l1ERC721GatewayLogic.address,
      constructorArguments: [],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('2-1: L1 ERC721Gateway Logic verified at', l1ERC721GatewayLogic.address);

  const l1ERC721GatewayProxy = await ethers.getContractAt(
    '@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    l1Network.tokenBridge.l1CustomGateway,
  );
  try {
    await run('verify:verify', {
      address: l1ERC721GatewayProxy.address,
      constructorArguments: [l1ERC721GatewayLogic.address, l1Network.tokenBridge.l1ProxyAdmin, '0x'],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('2-2: L1 ERC721Gateway Proxy verified at', l1ERC721GatewayProxy.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
