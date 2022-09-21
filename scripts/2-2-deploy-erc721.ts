import * as dotenv from 'dotenv';
import * as _ from 'lodash';
import { getL2Network } from '@arbitrum/sdk';
import { AdminErc721Bridger } from '../src/assetBridger/erc721Bridger';
import { ethers } from 'hardhat';
import { JsonStorage } from './utils/jsonStorage';
import { L1ERC721TokenFactory, L2ERC721TokenFactory } from './utils/contractFactories';
import { parseWallets } from './utils/parseWallets';
dotenv.config();

async function main(): Promise<void> {
  const { l2Provider, l1Wallet, l2Wallet } = parseWallets();
  const deployed = new JsonStorage('../deployed.json');
  if (deployed.get('l1ProxyAdmin') == null || deployed.get('l2ProxyAdmin') == null) {
    throw Error('ProxyAdmin not deployed');
  }
  if (deployed.get('l1CustomGateway') == null || deployed.get('l2CustomGateway') == null) {
    throw Error('CustomGateway not deployed');
  }

  const customTokenBridge = {
    l1CustomGateway: deployed.get('l1CustomGateway'),
    l2CustomGateway: deployed.get('l2CustomGateway'),
  };

  const defaultL2Network = await getL2Network(l2Provider);
  const l2Network = {
    ...defaultL2Network,
    tokenBridge: _.merge(defaultL2Network.tokenBridge, customTokenBridge),
  };
  const bridge = new AdminErc721Bridger(l2Network);

  // deploy L1 contracts
  if (deployed.get('l1ERC721Token') == null) {
    const L1ERC721Token = (await ethers.getContractFactory(L1ERC721TokenFactory)).connect(l1Wallet);
    const l1token = await L1ERC721Token.deploy(deployed.get('l1CustomGateway'), l2Network.tokenBridge.l1GatewayRouter);
    await l1token.deployed();
    deployed.set('l1ERC721Token', l1token.address);
    console.log('2-1: L1 ERC721 deployed to:', l1token.address);
  } else {
    console.log('2-1: L1 ERC721 already deployed at', deployed.get('l1ERC721Token'));
  }

  // deploy L2 contracts
  if (deployed.get('l2ERC721Token') == null) {
    const L2ERC721Token = (await ethers.getContractFactory(L2ERC721TokenFactory)).connect(l2Wallet);
    const l2token = await L2ERC721Token.deploy(deployed.get('l2CustomGateway'), deployed.get('l1ERC721Token'));
    await l2token.deployed();
    deployed.set('l2ERC721Token', l2token.address);
    console.log('2-2: L2 ERC721 deployed to:', l2token.address);
  } else {
    console.log('2-2: L2 ERC721 already deployed at', deployed.get('l2ERC721Token'));
  }

  // register tokens on bridge
  const registerTokenTx = await bridge.registerCustomToken(
    deployed.get('l1ERC721Token'),
    deployed.get('l2ERC721Token'),
    l1Wallet,
    l2Provider
  );
  await registerTokenTx.wait();
  console.log('2-3: ERC721 registered on bridge');

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
