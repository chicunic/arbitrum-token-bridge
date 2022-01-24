require('dotenv').config();
const { providers, Wallet } = require('ethers');
const { ethers, run } = require('hardhat');
const getNetworks = require('../utils/getNetworks');

const l1Provider = new providers.JsonRpcProvider(process.env.L1_RPC);
// const l2Provider = new providers.JsonRpcProvider(process.env.L2_RPC);
const l2Provider = ethers.provider;

const l1Signer = new Wallet(process.env.L1_PRIVKEY, l1Provider);
const l2Signer = new Wallet(process.env.L2_PRIVKEY, l2Provider);

async function main() {
  const { l1Network } = await getNetworks(l1Signer, l2Signer);

  console.log('1 - Verify L2 GatewayRouter');
  const l2GatewayRouterLogic = await ethers.getContractAt(
    'L2GatewayRouter',
    l1Network.tokenBridge.l2GatewayRouterLogic,
  );
  try {
    await run('verify:verify', {
      address: l2GatewayRouterLogic.address,
      constructorArguments: [],
    });
  } catch (err) {
    console.error(err.message);
  }

  console.log('1-1: L2 GatewayRouter Logic verified at', l2GatewayRouterLogic.address);

  const l2ProxyAdmin = await ethers.getContractAt(
    '@openzeppelin/contracts-0.8/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    l1Network.tokenBridge.l2ProxyAdmin,
  );
  try {
    await run('verify:verify', { address: l2ProxyAdmin.address, constructorArguments: [] });
  } catch (err) {
    console.error(err.message);
  }
  console.log('1-2: L2 ProxyAdmin verified at', l2ProxyAdmin.address);

  const l2TransparentUpgradeableProxy = await ethers.getContractAt(
    '@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    l1Network.tokenBridge.l2GatewayRouter,
  );
  try {
    await run('verify:verify', {
      address: l2TransparentUpgradeableProxy.address,
      constructorArguments: [l2GatewayRouterLogic.address, l2ProxyAdmin.address, '0x'],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('1-3: L2 GatewayRouter Proxy verified at', l2TransparentUpgradeableProxy.address);

  const l2CustomGatewayLogic = await ethers.getContractAt(
    'L2CustomGateway',
    l1Network.tokenBridge.l2CustomGatewayLogic,
  );
  try {
    await run('verify:verify', {
      address: l2CustomGatewayLogic.address,
      constructorArguments: [],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('2-1: L2 CustomGateway Logic verified at', l2CustomGatewayLogic.address);

  const l2CustomGatewayProxy = await ethers.getContractAt(
    '@openzeppelin/contracts-0.8/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    l1Network.tokenBridge.l2CustomGateway,
  );
  try {
    await run('verify:verify', {
      address: l2CustomGatewayProxy.address,
      constructorArguments: [l2CustomGatewayLogic.address, l1Network.tokenBridge.l2ProxyAdmin, '0x'],
    });
  } catch (err) {
    console.error(err.message);
  }
  console.log('2-2: L1 CustomGateway Proxy verified at', l2CustomGatewayProxy.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
