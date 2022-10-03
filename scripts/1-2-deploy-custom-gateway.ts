import * as dotenv from 'dotenv';
import { getL2Network } from '@arbitrum/sdk';
import { JsonStorage } from './utils/jsonStorage';
import { parseWallets } from './utils/parseWallets';
import {
  L1CustomGateway__factory,
  L2CustomGateway__factory,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory,
} from '../typechain-types';
dotenv.config();

async function main(): Promise<void> {
  const { l2Provider, l1Wallet, l2Wallet } = parseWallets();
  const deployed = new JsonStorage('../deployed.json');

  // deploy L1 contracts
  if (deployed.get('l1ProxyAdmin') == null) {
    const L1ProxyAdmin = new ProxyAdmin__factory(l1Wallet);
    const l1ProxyAdmin = await L1ProxyAdmin.deploy();
    await l1ProxyAdmin.deployed();
    deployed.set('l1ProxyAdmin', l1ProxyAdmin.address);
    console.log('1-1: L1 ProxyAdmin deployed at', l1ProxyAdmin.address);
  } else {
    console.log('1-1: L1 ProxyAdmin already deployed at', deployed.get('l1ProxyAdmin'));
  }

  if (deployed.get('l1CustomGatewayLogic') == null) {
    const L1CustomGateway = new L1CustomGateway__factory(l1Wallet);
    const l1CustomGatewayLogic = await L1CustomGateway.deploy();
    await l1CustomGatewayLogic.deployed();
    deployed.set('l1CustomGatewayLogic', l1CustomGatewayLogic.address);
    console.log('1-2: L1 CustomGateway Logic deployed at', l1CustomGatewayLogic.address);
  } else {
    console.log('1-2: L1 CustomGateway Logic already deployed at', deployed.get('l1CustomGatewayLogic'));
  }

  if (deployed.get('l1CustomGateway') == null) {
    const L1TransparentUpgradeableProxy = new TransparentUpgradeableProxy__factory(l1Wallet);
    const l1CustomGatewayProxy = await L1TransparentUpgradeableProxy.deploy(
      deployed.get('l1CustomGatewayLogic'),
      deployed.get('l1ProxyAdmin'),
      '0x'
    );
    await l1CustomGatewayProxy.deployed();
    deployed.set('l1CustomGateway', l1CustomGatewayProxy.address);
    console.log('1-3: L1 CustomGateway Proxy deployed at', l1CustomGatewayProxy.address);
  } else {
    console.log('1-3: L1 CustomGateway Proxy already deployed at', deployed.get('l1CustomGateway'));
  }

  // deploy L2 contracts
  if (deployed.get('l2ProxyAdmin') == null) {
    const L2ProxyAdmin = new ProxyAdmin__factory(l2Wallet);
    const l2ProxyAdmin = await L2ProxyAdmin.deploy();
    await l2ProxyAdmin.deployed();
    deployed.set('l2ProxyAdmin', l2ProxyAdmin.address);
    console.log('1-4: L2 ProxyAdmin deployed at', l2ProxyAdmin.address);
  } else {
    console.log('1-4: L2 ProxyAdmin already deployed at', deployed.get('l2ProxyAdmin'));
  }

  if (deployed.get('l2CustomGatewayLogic') == null) {
    const L2CustomGateway = new L2CustomGateway__factory(l2Wallet);
    const l2CustomGatewayLogic = await L2CustomGateway.deploy();
    await l2CustomGatewayLogic.deployed();
    deployed.set('l2CustomGatewayLogic', l2CustomGatewayLogic.address);
    console.log('1-5: L2 CustomGateway Logic deployed at', l2CustomGatewayLogic.address);
  } else {
    console.log('1-5: L2 CustomGateway Logic already deployed at', deployed.get('l2CustomGatewayLogic'));
  }

  if (deployed.get('l2CustomGateway') == null) {
    const L2TransparentUpgradeableProxy = new TransparentUpgradeableProxy__factory(l2Wallet);
    const l2CustomGatewayProxy = await L2TransparentUpgradeableProxy.deploy(
      deployed.get('l2CustomGatewayLogic'),
      deployed.get('l2ProxyAdmin'),
      '0x'
    );
    await l2CustomGatewayProxy.deployed();
    deployed.set('l2CustomGateway', l2CustomGatewayProxy.address);
    console.log('1-6: L2 CustomGateway Proxy deployed at', l2CustomGatewayProxy.address);
  } else {
    console.log('1-6: L2 CustomGateway Proxy already deployed at', deployed.get('l2CustomGateway'));
  }

  //  init L1 gateway
  const defaultL2Network = await getL2Network(l2Provider);

  if (deployed.get('l1CustomGatewayInitialized') == null) {
    const l1CustomGateway = L1CustomGateway__factory.connect(deployed.get('l1CustomGateway'), l1Wallet);
    const initL1Bridge = await l1CustomGateway.initialize(
      deployed.get('l2CustomGateway'),
      defaultL2Network.tokenBridge.l1GatewayRouter,
      defaultL2Network.ethBridge.inbox,
      l1Wallet.address
    );
    await initL1Bridge.wait();
    deployed.set('l1CustomGatewayInitialized', true);
    console.log('1-7: init L1 CustomGateway hash', initL1Bridge.hash);
  } else {
    console.log('1-7: L1 CustomGateway already initialized');
  }

  // init L2 gateway
  if (deployed.get('l2CustomGatewayInitialized') == null) {
    const l2CustomGateway = L2CustomGateway__factory.connect(deployed.get('l2CustomGateway'), l2Wallet);
    const initL2Bridge = await l2CustomGateway.initialize(
      deployed.get('l1CustomGateway'),
      defaultL2Network.tokenBridge.l2GatewayRouter
    );
    await initL2Bridge.wait();
    deployed.set('l2CustomGatewayInitialized', true);
    console.log('1-8: init L2 CustomGateway hash', initL2Bridge.hash);
  } else {
    console.log('1-8: L2 CustomGateway already initialized');
  }

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
